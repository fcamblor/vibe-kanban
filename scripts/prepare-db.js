#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const checkMode = process.argv.includes('--check');

console.log(checkMode ? 'Checking SQLx prepared queries...' : 'Preparing database for SQLx...');

// Change to backend directory
const backendDir = path.join(__dirname, '..', 'crates/db');
process.chdir(backendDir);

// Create dev database file
const devAssetsDir = path.join(__dirname, '..', 'dev_assets');
if (!fs.existsSync(devAssetsDir)) {
  fs.mkdirSync(devAssetsDir, { recursive: true });
}

const dbFile = path.join(devAssetsDir, 'db.sqlite');
// Don't overwrite if exists, just ensure it exists
if (!fs.existsSync(dbFile)) {
  fs.writeFileSync(dbFile, '');
  console.log(`Created db file: ${dbFile}`)
}

try {
  // Get absolute path (cross-platform)
  const dbPath = path.resolve(dbFile);
  const databaseUrl = `sqlite:${dbPath}`;

  console.log(`Using database: ${databaseUrl}`);

  // Run migrations
  console.log('Running migrations...');
  execSync('cargo sqlx migrate run', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl }
  });

  // Prepare queries
  const sqlxCommand = checkMode ? 'cargo sqlx prepare --check' : 'cargo sqlx prepare';
  console.log(checkMode ? 'Checking prepared queries...' : 'Preparing queries...');
  execSync(sqlxCommand, {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl }
  });

  console.log(checkMode ? 'SQLx check complete!' : 'Database preparation complete!');

} catch (error) {
  throw error;
}
