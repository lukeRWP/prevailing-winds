const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
  env: {
    API_URL: process.env.API_URL || 'http://localhost:8500',
  },
};

module.exports = nextConfig;
