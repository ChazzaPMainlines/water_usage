#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DATA_FILE = path.join(__dirname, 'water_usage.json');
// Approximated daily averages per person (litres).
const LOCAL_AVERAGE_LITRES = 150;
const GLOBAL_AVERAGE_LITRES = 173;

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

run();

function run() {
  ensureDataFile();
  promptForUsage()
    .then((amount) => {
      const entry = saveEntry(amount);
      printDailyComparison(entry.amount);
      maybePrintWeeklyChange();
    })
    .catch((err) => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
}

function printHelp() {
  console.log(`water_usage - log your daily water usage

Usage:
  node index.js           Prompt for today's usage (litres) and log it.
  node index.js --help    Show this help message.

Notes:
- Input must be a fixed-point number with one decimal place (e.g. 45.0).
- Data is stored in ${path.basename(DATA_FILE)} in this folder.
- On Mondays, you'll see a weekly change summary compared to the week before.`);
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
  }
}

function loadEntries() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

function saveEntry(amount) {
  const entries = loadEntries();
  const today = toDateString(new Date());
  const existingIndex = entries.findIndex((e) => e.date === today);

  const entry = { date: today, amount };
  if (existingIndex >= 0) {
    entries[existingIndex] = entry;
  } else {
    entries.push(entry);
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2));
  return entry;
}

function promptForUsage() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = 'How many litres did you use today? (whole number, e.g. 50): ';

  return new Promise((resolve, reject) => {
    rl.question(question, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      if (!/^\d+$/.test(trimmed)) {
        reject(new Error('Please enter a whole number of litres, e.g. 42'));
        return;
      }
      const amount = parseFloat(trimmed);
      resolve(amount);
    });
  });
}

function printDailyComparison(amount) {
  console.log('\nToday\'s log saved.');
  console.log(`  You: ${amount.toFixed(1)} L`);

  const localDiff = percentDiff(amount, LOCAL_AVERAGE_LITRES);
  const globalDiff = percentDiff(amount, GLOBAL_AVERAGE_LITRES);

  console.log(`  Local average (${LOCAL_AVERAGE_LITRES} L/day): ${formatDiff(localDiff)}`);
  console.log(`  Global average (${GLOBAL_AVERAGE_LITRES} L/day): ${formatDiff(globalDiff)}`);
}

function maybePrintWeeklyChange() {
  const today = startOfDay(new Date());
  if (today.getDay() !== 1) {
    return;
  }

  const entries = loadEntries();
  const lastWeekRange = getWeekRange(today, 1);
  const prevWeekRange = getWeekRange(today, 2);

  const lastWeekTotal = sumEntriesInRange(entries, lastWeekRange);
  const prevWeekTotal = sumEntriesInRange(entries, prevWeekRange);

  console.log('\nWeekly change (last week vs week before):');
  if (prevWeekTotal === 0 && lastWeekTotal === 0) {
    console.log('  No data for the past two weeks yet.');
    return;
  }

  if (prevWeekTotal === 0) {
    console.log('  No data for the prior week to compare against.');
    return;
  }

  const change = Math.round(((lastWeekTotal - prevWeekTotal) / prevWeekTotal) * 100);
  const direction = change === 0 ? 'no change' : change > 0 ? 'increase' : 'decrease';
  console.log(`  Total last week: ${lastWeekTotal.toFixed(1)} L`);
  console.log(`  Total prior week: ${prevWeekTotal.toFixed(1)} L`);
  console.log(`  Change: ${Math.abs(change)}% ${direction}`);
}

function sumEntriesInRange(entries, range) {
  return entries
    .filter((e) => {
      const entryDate = parseDateString(e.date);
      return entryDate >= range.start && entryDate <= range.end;
    })
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
}

function getWeekRange(today, weeksAgo) {
  // weeksAgo: 1 = last week (Mon-Sun), 2 = week before last, etc.
  const end = startOfDay(new Date(today));
  end.setDate(end.getDate() - 1 - 7 * (weeksAgo - 1)); // move to last Sunday of target week
  const start = startOfDay(new Date(end));
  start.setDate(start.getDate() - 6); // Monday of that week
  return { start, end };
}

function percentDiff(value, baseline) {
  if (baseline === 0) return 0;
  return ((value - baseline) / baseline) * 100;
}

function formatDiff(diff) {
  const rounded = Math.round(diff);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}% vs baseline`;
}

function toDateString(date) {
  const d = startOfDay(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDateString(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return startOfDay(new Date(y, m - 1, d));
}

