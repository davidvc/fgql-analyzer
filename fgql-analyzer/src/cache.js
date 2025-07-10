import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const CACHE_DIR = path.join(os.homedir(), '.fgql-analyzer', 'cache');

// Ensure cache directory exists
await fs.ensureDir(CACHE_DIR);

function getCacheKey(filePath) {
  const absolutePath = path.resolve(filePath);
  return crypto.createHash('md5').update(absolutePath).digest('hex');
}

export async function saveCache(filePath, analysis) {
  const cacheKey = getCacheKey(filePath);
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  
  await fs.writeJson(cachePath, analysis, { spaces: 2 });
  
  // Also update the index
  await updateCacheIndex(filePath, analysis.metadata);
}

export async function getCache(filePath) {
  const cacheKey = getCacheKey(filePath);
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  
  if (await fs.pathExists(cachePath)) {
    return await fs.readJson(cachePath);
  }
  
  throw new Error(`No cached analysis found for: ${filePath}`);
}

export async function hasCache(filePath) {
  const cacheKey = getCacheKey(filePath);
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  
  return await fs.pathExists(cachePath);
}

export async function getMostRecentCache() {
  const indexPath = path.join(CACHE_DIR, 'index.json');
  
  if (!await fs.pathExists(indexPath)) {
    throw new Error('No analyzed schemas found. Run "fgql-analyzer analyze <schema-file>" first.');
  }
  
  const index = await fs.readJson(indexPath);
  const entries = Object.entries(index);
  
  if (entries.length === 0) {
    throw new Error('No analyzed schemas found.');
  }
  
  // Sort by analyzed date, most recent first
  entries.sort((a, b) => new Date(b[1].analyzedAt) - new Date(a[1].analyzedAt));
  
  const [filePath, metadata] = entries[0];
  return await getCache(filePath);
}

export async function listCachedSchemas() {
  const indexPath = path.join(CACHE_DIR, 'index.json');
  
  if (!await fs.pathExists(indexPath)) {
    return [];
  }
  
  const index = await fs.readJson(indexPath);
  
  return Object.entries(index).map(([filePath, metadata]) => ({
    file: filePath,
    ...metadata
  })).sort((a, b) => new Date(b.analyzedAt) - new Date(a.analyzedAt));
}

export async function clearCache() {
  await fs.emptyDir(CACHE_DIR);
}

async function updateCacheIndex(filePath, metadata) {
  const indexPath = path.join(CACHE_DIR, 'index.json');
  let index = {};
  
  if (await fs.pathExists(indexPath)) {
    index = await fs.readJson(indexPath);
  }
  
  index[filePath] = {
    analyzedAt: metadata.analyzedAt,
    totalTypes: metadata.totalTypes,
    totalDependencies: metadata.totalDependencies
  };
  
  await fs.writeJson(indexPath, index, { spaces: 2 });
}