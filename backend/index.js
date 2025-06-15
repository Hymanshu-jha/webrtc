import cors from 'cors';
import express from 'express';
import { WebSocketServer } from 'ws';

const app = express();
const PORT = 5050;

// Allow all origins OR set specific domain (recommended for production)
app.use(cors({
  origin: '*', // ✅ Allow all
  // origin: 'https://your-vercel-app.vercel.app', // ✅ Replace for production
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true, // required if cookies or Authorization headers used
}));

// Express static if needed
// app.use(express.static(...));


app.get('/' , (req, res) => {
res.send('welcome to webrtc backend');
})

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
