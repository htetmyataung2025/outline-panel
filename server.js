require('dotenv').config();
const express = require('express');
const axios = require('axios');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const OUTLINE_API_URL = process.env.OUTLINE_API_URL;

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

app.get('/api/users', async (req, res) => {
    try {
        const cleanApiUrl = OUTLINE_API_URL.endsWith('/') ? OUTLINE_API_URL.slice(0, -1) : OUTLINE_API_URL;
        
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

app.post('/api/users/reset', async (req, res) => {
    const { keyId } = req.body;
    if (!keyId) return res.status(400).json({ success: false, message: 'Key ID လိုအပ်ပါသည်။' });

    try {
        const cleanApiUrl = OUTLINE_API_URL.endsWith('/') ? OUTLINE_API_URL.slice(0, -1) : OUTLINE_API_URL;

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
