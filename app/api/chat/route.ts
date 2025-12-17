import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

export const maxDuration = 300; // 5 minutes timeout for long responses

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      );
    }

    console.log(`[${new Date().toISOString()}] Received ${messages.length} messages`);

    // Format the conversation history for Claude
    const formattedPrompt = messages
      .map((msg: { role: string; content: string }) => {
        const roleLabel = msg.role === 'user' ? 'User' : 'Assistant';
        return `${roleLabel}: ${msg.content}`;
      })
      .join('\n\n');

    console.log(`[${new Date().toISOString()}] Formatted prompt:\n${formattedPrompt}`);

    // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const workingDir = process.env.CLAUDE_WORKING_DIR || process.cwd();

        console.log(`[${new Date().toISOString()}] Spawning claude in ${workingDir}`);

        const claude = spawn('claude', ['-p', formattedPrompt], {
          cwd: workingDir,
          env: process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Close stdin immediately
        if (claude.stdin) {
          claude.stdin.end();
        }

        let stderr = '';

        // Stream stdout data as it comes
        claude.stdout.on('data', (data) => {
          const text = data.toString();
          console.log(`[${new Date().toISOString()}] streaming chunk: ${text.length} chars`);
          controller.enqueue(encoder.encode(text));
        });

        claude.stderr.on('data', (data) => {
          const text = data.toString();
          stderr += text;
          console.log(`[${new Date().toISOString()}] stderr: ${text.substring(0, 200)}`);
        });

        claude.on('close', (code) => {
          console.log(`[${new Date().toISOString()}] Process exited with code ${code}`);

          if (code !== 0 && code !== null) {
            controller.enqueue(encoder.encode(`\n\nError: Claude exited with code ${code}`));
          }

          controller.close();
        });

        claude.on('error', (error) => {
          console.error(`[${new Date().toISOString()}] Spawn error:`, error);
          controller.enqueue(encoder.encode(`\n\nError: ${error.message}`));
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
