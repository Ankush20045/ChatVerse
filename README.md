# ChatVerse

ChatVerse is a modern anonymous real-time chat platform built with React, TypeScript, Tailwind CSS, Framer Motion, Node.js, Express, and Socket.IO.

## Features

- Anonymous username entry without login
- Global chat with realtime updates
- Private room creation and joining by room code
- Online presence and typing indicators
- Light/dark/neon/glass theme switching
- Server-memory persistence only

## Tech Stack

- Frontend: React, TypeScript, Tailwind CSS, Framer Motion
- Backend: Node.js, Express, Socket.IO
- Deployment: Render

## Run Locally

1. Install dependencies:

   npm install

2. Start the development stack:

   npm run dev

3. Visit the client at:

   http://localhost:5173

## Production Build

npm run build

## Render Deployment

1. Create a new Web Service on Render.
2. Point it to this repository.
3. Use the root package.json as the build path.
4. Set the start command to:

   npm run start

## Notes

- The app uses in-memory storage only.
- Rooms, sessions, and messages disappear on server restart.
# ChatVerse
