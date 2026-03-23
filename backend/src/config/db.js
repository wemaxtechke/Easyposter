import dns from 'node:dns';

// Network tweaks to reduce MongoDB SRV lookup issues on some networks
dns.setServers(['8.8.8.8', '1.1.1.1']);
dns.setDefaultResultOrder('ipv4first');

import mongoose from 'mongoose';

let mongoReady = false;

export function isMongoReady() {
  return mongoReady;
}

export function setMongoReady(value) {
  mongoReady = value;
}

export async function connectDB() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.warn('MONGODB_URI / MONGO_URI not set — texture/font APIs disabled.');
    return;
  }
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    setMongoReady(true);
    console.log('MongoDB connected');
  } catch (e) {
    console.error('MongoDB connection failed:', e?.message || e);
    console.error('HDR + health still work; texture/font library needs MONGODB_URI.');
  }
}
