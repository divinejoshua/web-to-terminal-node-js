import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

export const maxDuration = 300; // 5 minutes timeout for long responses

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    console.log(`[${new Date().toISOString()}] Received message: ${message}`);

    // Run claude command and collect output
    const output = await runClaudeCommand(message);

    console.log(`[${new Date().toISOString()}] Sending response: ${output.length} chars`);

    return NextResponse.json({ response: output });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function runClaudeCommand(message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const workingDir = process.env.CLAUDE_WORKING_DIR || process.cwd();

    console.log(`[${new Date().toISOString()}] Spawning claude in ${workingDir}`);
    console.log(`[${new Date().toISOString()}] Message: ${message}`);

    const claude = spawn('claude', ['-p', message], {
      cwd: workingDir,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Close stdin immediately - we're not sending any input
    if (claude.stdin) {
      claude.stdin.end();
    }

    let stdout = '';
    let stderr = '';
    let resolved = false;

    // Set a timeout of 5 minutes
    const timeout = setTimeout(() => {
      if (!resolved) {
        console.error(`[${new Date().toISOString()}] Timeout - killing process`);
        claude.kill('SIGTERM');
        reject(new Error('Claude command timed out after 5 minutes'));
        resolved = true;
      }
    }, 5 * 60 * 1000);

    claude.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      console.log(`[${new Date().toISOString()}] stdout chunk: ${text.length} chars`);
    });

    claude.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      console.log(`[${new Date().toISOString()}] stderr: ${text.substring(0, 200)}`);
    });

    claude.on('close', (code) => {
      clearTimeout(timeout);
      if (resolved) return;
      resolved = true;

      console.log(`[${new Date().toISOString()}] Process exited with code ${code}`);
      console.log(`[${new Date().toISOString()}] Total stdout: ${stdout.length} chars`);
      console.log(`[${new Date().toISOString()}] Total stderr: ${stderr.length} chars`);

      if (code !== 0 && code !== null) {
        reject(new Error(`Claude exited with code ${code}: ${stderr || 'No error output'}`));
        return;
      }

      if (!stdout.trim()) {
        reject(new Error('No output from Claude'));
        return;
      }

      // Clean up the output
      const cleaned = stdout
        // Remove system-reminder tags
        .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
        .trim();

      console.log(`[${new Date().toISOString()}] Sending ${cleaned.length} chars to client`);
      resolve(cleaned);
    });

    claude.on('error', (error) => {
      clearTimeout(timeout);
      if (resolved) return;
      resolved = true;

      console.error(`[${new Date().toISOString()}] Spawn error:`, error);
      reject(new Error(`Failed to start Claude: ${error.message}`));
    });
  });
}
