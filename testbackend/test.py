#!/usr/bin/env python

import asyncio
import websockets
import os
import json
from google import genai
from dotenv import load_dotenv

# Load environment variables from a .env file (if present)
# This is useful for securely storing your API key (e.g., GENAI_API_KEY)
load_dotenv()

# --- Gemini API Configuration ---
# Configure the genai library with your API key.
# It first tries to get the key from the environment variable 'GENAI_API_KEY'.
# If not found, it uses an empty string. In Canvas, the API key is automatically
# injected at runtime, so leaving it empty here is acceptable if you're not
# running it locally with a .env file.

# Initialize the GenerativeModel outside the async functions.
# This ensures the model is loaded only once when the server starts,
# improving efficiency for subsequent requests.
try:
    # Using 'gemini-2.0-flash-001' as specified in your example.
    client = genai.Client(api_key=os.getenv("GEMINI_API"))
    model = client.chats.create(model='gemini-2.0-flash-001')
    print("Gemini GenerativeModel initialized successfully.", flush=True)
except Exception as e:
    print(f"Error initializing Gemini GenerativeModel: {e}", flush=True)
    model = None # Set model to None if initialization fails, to prevent errors later

# --- WebSocket Echo Function (modified for Gemini Chat Assistant) ---
async def echo(websocket):
    """
    Handles incoming WebSocket connections.
    Receives a message from the client, uses it as a prompt for the Gemini API,
    and streams the generated assistant response back to the client.
    """
    # Check if the Gemini model was initialized successfully
    if not model:
        print("Gemini GenerativeModel is not available. Cannot process requests.", flush=True)
        await websocket.send("Error: AI model not ready to generate content.")
        await websocket.send("[END]")
        return

    # Create a chat session for this specific WebSocket connection.
    # This allows the model to maintain conversational context across multiple messages
    # within the same client session.
    chat_session = model
    print("New chat session started for WebSocket connection.", flush=True)

    try:
        # Loop to continuously receive messages from the client
        async for message in websocket:
            print(f"Received message from client: '{message}'", flush=True)

            # Use the client's message directly as the prompt for the chat assistant.
            # The chat_session object handles appending this message to the history
            # and sending the full history to the model for contextual responses.
            prompt = message
            print(f"Sending prompt to Gemini chat session: '{prompt}'", flush=True)

            # Generate content from the model in a streaming fashion.
            # Streaming allows parts of the response to be sent as they are generated,
            # providing a more responsive user experience.
            full_response_text = ""
            try:
                for chunk in chat_session.send_message_stream(prompt):
                    print(chunk.text)
                    if chunk.text:
                        await websocket.send(chunk.text) # Send each text chunk back to the client
                        full_response_text += chunk.text # Accumulate the full response for logging
                
                print(f"Successfully generated and sent assistant response. First 100 chars: {full_response_text[:100]}...", flush=True)
            except Exception as gemini_e:
                # Handle errors specifically from the Gemini API call
                error_msg = f"Error generating content from Gemini: {gemini_e}"
                print(error_msg, flush=True)
                await websocket.send(f"Error from AI: {error_msg}")

            # Send an "[END]" signal to the client to indicate the completion of the message
            await websocket.send("[END]")

    except websockets.exceptions.ConnectionClosed:
        # Log when a client disconnects gracefully
        print("Client disconnected.", flush=True)
    except Exception as e:
        # Catch any other unexpected errors during WebSocket communication
        print(f"An unexpected error occurred during WebSocket communication: {e}", flush=True)

# --- Main Server Function ---
async def main():
    """
    Starts the WebSocket server.
    """
    print("WebSocket server starting...", flush=True)

    # Determine the port to run on, defaulting to 8090 if not set in environment variables
    port = int(os.environ.get('PORT', 8090))

    # Start the WebSocket server.
    # 'websockets.serve' creates a server that listens for incoming WebSocket connections.
    # It automatically handles CORS for simple cases.
    async with websockets.serve(
        echo,          # The handler function for new connections
        "0.0.0.0",     # Listen on all available network interfaces
        port           # The port number
    ) as server:
        print(f"WebSocket server running on port {port}", flush=True)
        # Keep the server running indefinitely
        await asyncio.Future()

# --- Entry Point ---
if __name__ == "__main__":
    # Run the main asynchronous function
    asyncio.run(main())
