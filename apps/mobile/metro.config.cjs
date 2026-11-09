const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const config = getDefaultConfig(__dirname);
// Keep local PostgreSQL/npm caches and generated bundles outside Metro's file crawler.
const root = path.resolve(__dirname, '../..').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [new RegExp(`${root}/\\.local/.*`), new RegExp(`${root}/apps/(web|mobile)/dist/.*`)];
module.exports = config;
