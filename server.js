require('dotenv').config();
const express = require('express');
const axios = require('axios');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ကော်မာ ခံထားသော API URL များကို Array အဖြစ် ပြောင်းလဲခြင်း
const OUTLINE_API_URLS = process.env.OUTLINE_API_URLS ? process.env.OUTLINE_API_URLS.split(',') : [];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const agent = new https.Agent({ rejectUnauthorized: false });

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 KB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ရွေးချယ်ထားသော Server ရဲ့ URL ကို သန့်စင်ပေးမည့် Helper
function getCleanUrl(serverIndex) {
    const idx = parseInt(serverIndex);
    if (isNaN(idx) || idx < 0 || idx >= OUTLINE_API_URLS.length) return null;
    const url = OUTLINE_API_URLS[idx].trim();
    return url.endsWith('/') ? url.slice(0, -1) : url;
}

// ၁။ API: လက်ရှိ ချိတ်ဆက်ထားသော Server အရေအတွက်ကို ပို့ပေးရန်
app.get('/api/servers', (req, res) => {
    const serverList = OUTLINE_API_URLS.map((url, index) => {
        try {
            const parsedUrl = new URL(url.trim());
            return { index, name: `Server ${index + 1} (${parsedUrl.hostname})` };
        } catch (e) {
            return { index, name: `Server ${index + 1}` };
        }
    });
    res.json({ success: true, servers: serverList });
});

// ၂။ API: ရွေးချယ်ထားသည့် Server ဆီက User များစာရင်း ယူရန်
app.get('/api/users', async (req, res) => {
    const serverIdx = req.query.serverIdx || 0;
    const cleanApiUrl = getCleanUrl(serverIdx);

    if (!cleanApiUrl) return res.status(400).json({ success: false, message: 'Invalid Server Index' });

    try {
        const keysRes = await axios.get(`${cleanApiUrl}/access-keys`, { httpsAgent: agent });
        const metricsRes = await axios.get(`${cleanApiUrl}/metrics/transfer`, { httpsAgent: agent });

        const accessKeys = keysRes.data.accessKeys;
        const dataUsage = metricsRes.data.bytesTransferredByUserId || {};

        const users = accessKeys.map(key => {
            const bytesUsed = dataUsage[key.id] || 0;
            return {
                id: key.id,
                name: key.name || `Unnamed User (${key.id})`,
                accessUrl: key.accessUrl,
                dataUsageReadable: formatBytes(bytesUsed),
                bytes: bytesUsed
            };
        });

        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ၃။ API: ရွေးချယ်ထားသည့် Server ပေါ်က User ကို Reset ချရန်
app.post('/api/users/reset', async (req, res) => {
    const { keyId, serverIdx } = req.body;
    const cleanApiUrl = getCleanUrl(serverIdx || 0);

    if (!cleanApiUrl) return res.status(400).json({ success: false, message: 'Invalid Server Index' });
    if (!keyId) return res.status(400).json({ success: false, message: 'Key ID လိုအပ်ပါသည်။' });

    try {
        const keysRes = await axios.get(`${cleanApiUrl}/access-keys`, { httpsAgent: agent });
        const targetKey = keysRes.data.accessKeys.find(k => k.id === keyId);

        if (!targetKey) return res.status(404).json({ success: false, message: 'User ကို ရှာမတွေ့ပါ။' });
        const oldName = targetKey.name || `User_${keyId}`;

        await axios.delete(`${cleanApiUrl}/access-keys/${keyId}`, { httpsAgent: agent });

        const createRes = await axios.post(`${cleanApiUrl}/access-keys`, {}, { httpsAgent: agent });
        const newKey = createRes.data;

        await axios.put(`${cleanApiUrl}/access-keys/${newKey.id}/name`, { name: oldName }, { httpsAgent: agent });

        res.json({
            success: true,
            message: `${oldName} ၏ Data Usage ကို အောင်မြင်စွာ Reset ချပြီးပါပြီ။`,
            newKey: {
                id: newKey.id,
                name: oldName,
                accessUrl: newKey.accessUrl
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`[✓] Server running on port ${PORT}`);
});
