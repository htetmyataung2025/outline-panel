require('dotenv').config();
const express = require('express');
const axios = require('axios');
const https = require('https');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const OUTLINE_API_URL = process.env.OUTLINE_API_URL;

// Middleware 
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Outline SSL ကိစ္စကျော်ရန်
const agent = new https.Agent({ rejectUnauthorized: false });

// Helper: Bytes ကို GB/MB ပြောင်းရန်
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 KB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ၁။ API: လက်ရှိ User Keys အားလုံးနှင့် Data Usage ကို ဆွဲယူရန်
app.get('/api/users', async (req, res) => {
    try {
        // Access keys များကို ယူခြင်း
        const keysRes = await axios.get(`${OUTLINE_API_URL}/access-keys`, { httpsAgent: agent });
        // Data usage metrics များကို ယူခြင်း
        const metricsRes = await axios.get(`${OUTLINE_API_URL}/metrics/transfer`, { httpsAgent: agent });

        const accessKeys = keysRes.data.accessKeys;
        const dataUsage = metricsRes.data.bytesTransferredByUserId || {};

        // အချက်အလက်များကို ပေါင်းစပ်ခြင်း
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

// ၂။ API: အဟောင်းကိုဖျက်၊ အသစ်ပြန်ဆောက်ပြီး Data Usage ကို Reset ချရန်
app.post('/api/users/reset', async (req, res) => {
    const { keyId } = req.body;
    if (!keyId) return res.status(400).json({ success: false, message: 'Key ID လိုအပ်ပါသည်။' });

    try {
        // (က) လက်ရှိ Key နာမည်ကို မှတ်ထားခြင်း
        const keysRes = await axios.get(`${OUTLINE_API_URL}/access-keys`, { httpsAgent: agent });
        const targetKey = keysRes.data.accessKeys.find(k => k.id === keyId);

        if (!targetKey) return res.status(404).json({ success: false, message: 'User ကို ရှာမတွေ့ပါ။' });
        const oldName = targetKey.name || `User_${keyId}`;

        // (ခ) Key အဟောင်းကို ဖြတ်ချခြင်း
        await axios.delete(`${OUTLINE_API_URL}/access-keys/${keyId}`, { httpsAgent: agent });

        // (ဂ) Key အသစ် ပြန်ဆောက်ခြင်း (ဒါဆိုရင် Usage 0 ဖြစ်သွားမည်)
        const createRes = await axios.post(`${OUTLINE_API_URL}/access-keys`, {}, { httpsAgent: agent });
        const newKey = createRes.data;

        // (ဃ) နာမည်ဟောင်း ပြန်ပေးခြင်း
        await axios.put(`${OUTLINE_API_URL}/access-keys/${newKey.id}/name`, { name: oldName }, { httpsAgent: agent });

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

// Front-end ကို ချိတ်ဆက်ခြင်း
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`[✓] Outline Web Panel သည် http://localhost:${PORT} တွင် စတင်အလုပ်လုပ်နေပါပြီ။`);
});
