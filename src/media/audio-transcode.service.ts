import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

@Injectable()
export class AudioTranscodeService {
  private readonly logger = new Logger(AudioTranscodeService.name);

  /**
   * Browser `MediaRecorder` MP4 audio streams out in chunks without a
   * finalized `moov` atom — a file `afinfo`/`file` both call valid AAC/MP4,
   * but that WhatsApp's media-scrutiny step silently rejects after already
   * accepting the upload (error 131053, "mediaEngineStatus: 0"). Re-encoding
   * the exact same audio with a proper encoder is what makes it deliver.
   *
   * OGG/Opus (Firefox's recording format) isn't affected, so this only runs
   * for MP4. If ffmpeg itself fails, the original buffer still goes out —
   * sending the file as recorded beats not sending anything.
   */
  async normalizeIfNeeded(buffer: Buffer, mimeType: string): Promise<Buffer> {
    if (mimeType !== 'audio/mp4' || !ffmpegPath) return buffer;

    const dir = await mkdtemp(join(tmpdir(), 'daverdinha-audio-'));
    const inputPath = join(dir, `${randomUUID()}.m4a`);
    const outputPath = join(dir, `${randomUUID()}.m4a`);

    try {
      await writeFile(inputPath, buffer);
      await this.runFfmpeg(inputPath, outputPath);
      return await readFile(outputPath);
    } catch (error) {
      this.logger.warn(`Audio re-encode failed, sending the original file: ${error}`);
      return buffer;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private runFfmpeg(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath!, [
        '-y',
        '-i',
        inputPath,
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        outputPath,
      ]);

      let stderr = '';
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      });
    });
  }
}
