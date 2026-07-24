const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/books.html');
});

// Added route for music.html
app.get('/music.html', (req, res) => {
    res.sendFile(__dirname + '/music.html');
});

// Spotify Credentials from .env
const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const refresh_token = process.env.SPOTIFY_REFRESH_TOKEN;

const TOKEN_ENDPOINT = `https://accounts.spotify.com/api/token`;
const NOW_PLAYING_ENDPOINT = `https://api.spotify.com/v1/me/player/currently-playing`;

// Helper function to get a fresh Access Token using your Refresh Token
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

// API Endpoint for your frontend to fetch current song
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
        res.status(500).json({ error: 'Failed to fetch currently playing track' });
    }
});

// Newsletter subscription endpoint
app.post('/api/subscribe', (req, res) => {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
        return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }

    console.log(`New subscriber email received: ${email}`);

    return res.status(200).json({ success: true, message: "You're successfully subscribed!" });
});

// Temporary route to catch the Spotify authorization code
app.get('/callback', (req, res) => {
    const code = req.query.code || null;
    res.send(`
        <h2>Authorization Successful!</h2>
        <p>Copy this code and use it in your terminal command:</p>
        <textarea style="width:600px; height:100px; padding:10px;">${code}</textarea>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://127.0.0.1:${PORT}`);
});