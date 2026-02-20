import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const OUTPUT_PATH = path.resolve(process.cwd(), 'src/data/kols.json');
const SCRAPINGBEE_KEY = process.env.SCRAPINGBEE_API_KEY || '';
const KOLSCAN_URL = process.env.KOLSCAN_URL || 'https://kolscan.io';
const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  process.env.VITE_SOLANA_RPC_URL ||
  'https://api.mainnet-beta.solana.com';
const SCAN_LIMIT = Number(process.env.SCAN_LIMIT || 0);
const SCAN_CONCURRENCY = Math.max(1, Number(process.env.SCAN_CONCURRENCY || 1));
const SKIP_PORTFOLIO = process.env.SKIP_PORTFOLIO === '1';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const connection = new Connection(RPC_URL, 'confirmed');

const TOKEN_MINTS = {
  So11111111111111111111111111111111111111112: 'SOL',
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: 'JUP',
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: 'BONK',
  '4k3Dyjzvzp8eS9rqq4t7WZrPAVnXpt2nSEb2ACk1ZQMR': 'RAY',
  Es9vMFrzaCER3a9nXbh7LQ98x7kP3n8t9Yx1vucnK7R9: 'USDT',
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 'USDC',
};

const PRICE_MAP = {
  ETH: 3200,
  AAVE: 110,
  BTC: 64000,
  SOL: 150,
  JUP: 1.2,
  BONK: 0.00002,
  PYTH: 0.5,
  WIF: 2.3,
  USDC: 1,
  JTO: 2.5,
  MATIC: 0.9,
  ARB: 1.1,
  PEPE: 0.00001,
  SHIB: 0.00001,
  RAY: 1.2,
  USDT: 1,
};

const SOL_ADDRESS_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
const X_HANDLE_RE = /(?:x\.com\/|twitter\.com\/|@)([A-Za-z0-9_]{1,15})/g;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const unique = (arr) => Array.from(new Set(arr));

const fetchText = async (url) => {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'kol-scrape/1.0',
      accept: 'text/plain,application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status}: ${url}`);
  }
  return await res.text();
};

const extractAddresses = (text) => unique(text.match(SOL_ADDRESS_RE) || []);
const extractHandles = (text) =>
  unique(Array.from(text.matchAll(X_HANDLE_RE)).map((m) => m[1]));

const normalizeTokens = (tokens) => {
  const map = new Map();
  tokens.forEach((token) => {
    const key = token.symbol;
    if (!map.has(key)) {
      map.set(key, { ...token });
    } else {
      const existing = map.get(key);
      existing.amount += token.amount;
      existing.usdValue += token.usdValue;
    }
  });
  return Array.from(map.values()).filter((token) => token.amount > 0);
};

const sortTokens = (tokens, balance) => {
  const list = [...tokens];
  if (balance > 0 && !list.find((token) => token.symbol === 'SOL')) {
    list.unshift({
      symbol: 'SOL',
      amount: balance,
      usdValue: balance * (PRICE_MAP.SOL || 150),
    });
  }
  return list.sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0));
};

const fetchPortfolio = async (address) => {
  const publicKey = new PublicKey(address);
  const balanceLamports = await connection.getBalance(publicKey);
  const balance = balanceLamports / LAMPORTS_PER_SOL;

  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
    programId: TOKEN_PROGRAM_ID,
  });

  const tokens = [];
  tokenAccounts.value.forEach(({ account }) => {
    const info = account.data.parsed.info;
    const amount = info.tokenAmount.uiAmount || 0;
    if (!amount || amount <= 0) return;
    const mint = info.mint;
    const decimals = info.tokenAmount.decimals;
    const symbol = TOKEN_MINTS[mint] || mint.slice(0, 4).toUpperCase();
    const price = PRICE_MAP[symbol] || 0;
    if (decimals === 0 && amount === 1) return;
    tokens.push({
      symbol,
      mint,
      amount,
      usdValue: amount * price,
    });
  });

  const normalized = normalizeTokens(tokens);
  const totalValue =
    normalized.reduce((sum, token) => sum + (token.usdValue || 0), 0) +
    balance * (PRICE_MAP.SOL || 150);

  return {
    balance,
    tokens: sortTokens(normalized, balance),
    total_value: totalValue,
  };
};

const fetchGithubRepoFiles = async (owner, repo) => {
  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`;
  const treeText = await fetchText(treeUrl);
  const tree = JSON.parse(treeText);
  if (!tree?.tree) return [];
  return tree.tree
    .filter((item) => item.type === 'blob')
    .map((item) => item.path);
};

const fetchGithubRaw = async (owner, repo, filePath) => {
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${filePath}`;
  return await fetchText(rawUrl);
};

const scrapeFromGithubRepo = async () => {
  const owner = 'FrontrunPro';
  const repo = 'frontrun-extension';
  const files = await fetchGithubRepoFiles(owner, repo);
  const candidateFiles = files.filter((file) =>
    /\.(json|csv|md|txt)$/i.test(file)
  );
  const rows = [];
  for (const filePath of candidateFiles) {
    try {
      const content = await fetchGithubRaw(owner, repo, filePath);
      const addresses = extractAddresses(content);
      const handles = extractHandles(content);
      if (addresses.length || handles.length) {
        rows.push({ filePath, addresses, handles });
      }
      await sleep(120);
    } catch (error) {
      console.warn(`Skip ${filePath}:`, error.message);
    }
  }
  return rows;
};

const scrapeKolscanWithPuppeteer = async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.goto(KOLSCAN_URL, { waitUntil: 'networkidle2' });
  await sleep(2000);
  const html = await page.content();
  await browser.close();
  const addresses = extractAddresses(html);
  const handles = extractHandles(html);
  return { addresses, handles };
};

const scrapeKolscanWithScrapingBee = async () => {
  if (!SCRAPINGBEE_KEY) return null;
  const apiUrl = new URL('https://app.scrapingbee.com/api/v1/');
  apiUrl.searchParams.set('api_key', SCRAPINGBEE_KEY);
  apiUrl.searchParams.set('url', KOLSCAN_URL);
  apiUrl.searchParams.set('render_js', 'true');
  const html = await fetchText(apiUrl.toString());
  const addresses = extractAddresses(html);
  const handles = extractHandles(html);
  return { addresses, handles };
};

const isValidAddress = (address) => {
  try {
    const key = new PublicKey(address);
    return key.toBase58().length >= 32;
  } catch {
    return false;
  }
};

const buildKols = ({ repoFindings, kolscanFindings }) => {
  const walletToHandles = new Map();
  repoFindings.forEach((row) => {
    row.addresses.forEach((addr) => {
      if (!walletToHandles.has(addr)) walletToHandles.set(addr, new Set());
      row.handles.forEach((handle) => walletToHandles.get(addr).add(handle));
    });
  });
  (kolscanFindings?.addresses || []).forEach((addr) => {
    if (!walletToHandles.has(addr)) walletToHandles.set(addr, new Set());
  });
  (kolscanFindings?.handles || []).forEach((handle) => {
    for (const set of walletToHandles.values()) {
      set.add(handle);
    }
  });

  const entries = Array.from(walletToHandles.entries())
    .filter(([wallet]) => isValidAddress(wallet))
    .map(([wallet, handles]) => {
    const handle = Array.from(handles.values())[0] || '';
    return {
      wallet,
      name: handle ? handle.replace(/^@/, '') : wallet.slice(0, 6),
      xHandle: handle || '',
      netWorth: 0,
      likes: 0,
      tokens: [],
    };
  });
  return entries;
};

const enrichWithPortfolio = async (kols) => {
  if (SKIP_PORTFOLIO) return kols;
  const list = SCAN_LIMIT > 0 ? kols.slice(0, SCAN_LIMIT) : kols;
  let index = 0;
  const results = [...list];
  const workers = Array.from({ length: SCAN_CONCURRENCY }).map(async () => {
    while (index < list.length) {
      const current = list[index++];
      try {
        const portfolio = await fetchPortfolio(current.wallet);
        current.tokens = (portfolio.tokens || []).slice(0, 5).map((token) => ({
          symbol: token.symbol,
          amount: Number(token.amount.toFixed(4)),
        }));
        current.netWorth = Math.round(portfolio.total_value || 0);
      } catch (error) {
        console.warn(`Portfolio scan failed for ${current.wallet}:`, error.message);
      }
      await sleep(250);
    }
  });
  await Promise.all(workers);
  return results;
};

const main = async () => {
  const repoFindings = await scrapeFromGithubRepo();

  let kolscanFindings = null;
  if (SCRAPINGBEE_KEY) {
    kolscanFindings = await scrapeKolscanWithScrapingBee();
  } else {
    kolscanFindings = await scrapeKolscanWithPuppeteer();
  }

  let kols = buildKols({ repoFindings, kolscanFindings });
  if (!kols.length) {
    console.warn('No KOLs found. Leaving existing file unchanged.');
    process.exit(1);
  }
  kols = await enrichWithPortfolio(kols);

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(kols, null, 2), 'utf8');
  console.log(`Saved ${kols.length} KOLs to ${OUTPUT_PATH}`);
};

main().catch((error) => {
  console.error('KOL scrape failed:', error);
  process.exit(1);
});
