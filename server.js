require('dotenv').config();

const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Cloud Run sets K_SERVICE. There the server logs in to Firebase with its own
// Google account, so no key file is needed. On your computer it uses serviceAccountKey.json.
const isCloudRun = Boolean(process.env.K_SERVICE);
const keyFile = path.join(__dirname, 'serviceAccountKey.json');

if (!isCloudRun && fs.existsSync(keyFile)) {
    initializeApp({ credential: cert(require(keyFile)) });
} else {
    initializeApp();
}
const db = getFirestore();

// Configure Nodemailer transporter using Gmail SMTP.
// EMAIL_USER and EMAIL_PASS come from .env. Never write the password in this file.
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Only these websites may call the API from a browser.
// Set ALLOWED_ORIGIN in .env or on Cloud Run (comma-separated) to change it.
const allowedOrigins = (process.env.ALLOWED_ORIGIN || 'https://bluebound-ink.com,https://www.bluebound-ink.com')
    .split(',')
    .map(origin => origin.trim());

const app = express();
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '10kb' }));

// On your computer the server also shows the website, so you can test everything at
// http://127.0.0.1:3000. On Cloud Run it is only the API (the website is on GitHub Pages).
if (!isCloudRun) {
    app.use(express.static(__dirname));
}

// Spotify Credentials & Endpoints from .env
const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const refresh_token = process.env.SPOTIFY_REFRESH_TOKEN;

const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const NOW_PLAYING_ENDPOINT = 'https://api.spotify.com/v1/me/player/currently-playing';

// Helper function to get a fresh Spotify Access Token
const getAccessToken = async () => {
    const basic = Buffer.from(`${client_id}:${client_secret}`).toString('base64');
    const response = await axios.post(TOKEN_ENDPOINT, new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh_token
    }), {
        headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });
    return response.data.access_token;
};

// API Endpoint for frontend to fetch current song (with detailed error logs)
app.get('/api/now-playing', async (req, res) => {
    try {
        const access_token = await getAccessToken();
        const response = await axios.get(NOW_PLAYING_ENDPOINT, {
            headers: {
                Authorization: `Bearer ${access_token}`
            }
        });
        
        if (response.status === 204 || !response.data || !response.data.item) {
            return res.json({ isPlaying: false });
        }

        const song = response.data;
        res.json({
            isPlaying: song.is_playing,
            title: song.item.name,
            artist: song.item.artists.map(_artist => _artist.name).join(', '),
            albumImageUrl: song.item.album.images[0].url
        });
    } catch (error) {
        console.error("Spotify API Error Message:", error.message);
        if (error.response) {
            console.error("Spotify Response Status:", error.response.status);
            console.error("Spotify Response Data:", JSON.stringify(error.response.data, null, 2));
        }
        res.status(500).json({ error: 'Failed to fetch currently playing track' });
    }
});

app.post('/api/recommendations', async (req, res) => {
  const { bookInfo, comment, tag } = req.body;

  if (!bookInfo) {
    return res.status(400).json({ error: 'Title & Author are required.' });
  }

  if (String(bookInfo).length > 200 || String(comment || '').length > 2000 || String(tag || '').length > 50) {
    return res.status(400).json({ error: 'Your note is too long.' });
  }

  const mailOptions = {
    from: '"Bluebound Ink Reader" <bluebound.ink@gmail.com>',
    to: 'bluebound.ink@gmail.com',
    subject: `New Book Recommendation [${tag}]`,
    text: `You received a new recommendation!\n\nTag: #${tag}\nBook: ${bookInfo}\nNotes: ${comment || 'N/A'}`
  };

  try {
    await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, message: 'Recommendation sent!' });
  } catch (error) {
    console.error('Email error:', error);
    return res.status(500).json({ error: 'Failed to send email.' });
  }
});

app.post('/api/subscribe', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required." });
        }

        // Simple check so the server does not send mail to nonsense addresses
        if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, message: "Please enter a valid email address." });
        }

        const subscriberRef = db.collection('subscribers').doc(email);

        await subscriberRef.set({
            email: email,
            subscribedAt: new Date().toISOString()
        });

        const mailOptions = {
            from: {
                name: 'Bluebound Ink',
                address: process.env.EMAIL_USER
            },
            to: email,
            subject: 'Welcome to Bluebound Ink',
            text: 'Thank you for subscribing to Bluebound Ink.',
            html: `
                <div style="font-family: Georgia, serif; color: #2c2925; padding: 20px;">
                    <h2 style="font-style: italic;">Welcome to Bluebound Ink</h2>
                    <p>Thank you for subscribing. You are now on the list to receive occasional notes.</p>
                    <p style="color: #888; font-size: 0.9rem; margin-top: 30px;">Bluebound Ink</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Confirmation email sent and subscriber saved: ${email}`);

        return res.status(200).json({ 
            success: true, 
            message: "You're successfully subscribed! Check your inbox." 
        });

    } catch (error) {
        console.error("Subscription or Email Error:", error);
        res.status(500).json({ success: false, message: "Something went wrong. Please try again later." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://127.0.0.1:${PORT}`);
});