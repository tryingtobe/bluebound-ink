const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
require('dotenv').config();
const nodemailer = require('nodemailer');
const { Resend } = require('resend');

// Initialize Firebase Admin using the service account key file
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
    credential: cert(serviceAccount)
});
const db = getFirestore();

// Configure Nodemailer transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Initialize Resend with your API key from .env
const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Routes for static HTML files
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/books.html');
});

app.get('/music.html', (req, res) => {
    res.sendFile(__dirname + '/music.html');
});

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

// API Endpoint for frontend to fetch current song
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
        console.error("Spotify API Error:", error.message);
        res.status(500).json({ error: 'Failed to fetch currently playing track' });
    }
});

// Example endpoint that triggers a test email via Resend
app.post('/api/send-email', async (req, res) => {
    try {
        const { data, error } = await resend.emails.send({
            from: 'onboarding@resend.dev', 
            to: 'delivered@resend.dev',     
            subject: 'Hello from Bluebound Ink!',
            html: '<p>Congrats! Your email system is working.</p>'
        });

        if (error) {
            return res.status(400).json({ error });
        }

        res.status(200).json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Subscription endpoint (Saves to Firestore & sends welcome email via Nodemailer)
app.post('/api/subscribe', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required." });
        }

        // Reference to Firestore collection
        const subscriberRef = db.collection('subscribers').doc(email);

        // Save email and timestamp to Firestore
        await subscriberRef.set({
            email: email,
            subscribedAt: new Date().toISOString()
        });

        // Define mailOptions with the clean sender display name
        const mailOptions = {
            from: {
                name: 'Bluebound Ink',
                address: process.env.EMAIL_USER
            },
            to: email,
            subject: 'Welcome to Bluebound Ink',
            text: 'Thank you for subscribing to Bluebound Ink. You will receive occasional notes on creative explorations, books, and music.',
            html: `
                <div style="font-family: Georgia, serif; color: #2c2925; padding: 20px;">
                    <h2 style="font-style: italic;">Welcome to Bluebound Ink</h2>
                    <p>Thank you for subscribing. You are now on the list to receive occasional notes on creative explorations, books, and music.</p>
                    <p style="color: #888; font-size: 0.9rem; margin-top: 30px;">Bluebound Ink</p>
                </div>
            `
        };

        // Send the confirmation email
        await transporter.sendMail(mailOptions);
        console.log(`Confirmation email sent and subscriber saved: ${email}`);

        return res.status(200).json({ 
            success: true, 
            message: "You're successfully subscribed! Check your inbox for a confirmation note." 
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