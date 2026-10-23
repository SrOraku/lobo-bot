'use strict';
const NodeCache = require('node-cache');
const { logger } = require('./helpers');

let redisClient = null;
const memCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

async function initRedis() {
  if (!process.env.REDIS_URL) return;
  try {
    const { createClient } = require('redis');
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (err) => logger.warn('Redis error:', err.message));
    await redisClient.connect();
    logger.info('✅ Redis conectado');
  } catch (err) {
    logger.warn('⚠️ Redis não disponível, usando cache em memória:', err.message);
    redisClient = null;
  }
}

async function get(key) {
  key=require('../isolation/context').cacheKey(key);
  if (redisClient?.isReady) {
    const val = await redisClient.get(key);
    return val ? JSON.parse(val) : null;
  }
  return memCache.get(key) ?? null;
}

async function set(key, value, ttl = 300) {
  key=require('../isolation/context').cacheKey(key);
  if (redisClient?.isReady) {
    await redisClient.setEx(key, ttl, JSON.stringify(value));
  } else {
    memCache.set(key, value, ttl);
  }
}

async function del(key) {
  key=require('../isolation/context').cacheKey(key);
  if (redisClient?.isReady) {
    await redisClient.del(key);
  } else {
    memCache.del(key);
  }
}

async function exists(key) {
  key=require('../isolation/context').cacheKey(key);
  if (redisClient?.isReady) {
    return (await redisClient.exists(key)) === 1;
  }
  return memCache.has(key);
}

module.exports = { initRedis, get, set, del, exists };
