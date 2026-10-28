import { Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary for this platform');
import { AudioTranscodeService } from './audio-transcode.service';

describe('AudioTranscodeService', () => {
  let service: AudioTranscodeService;

  beforeEach(() => {
    service = new AudioTranscodeService();
  });

  it('leaves non-MP4 audio untouched — OGG/Opus is not affected by the bug this works around', async () => {
    const buffer = Buffer.from('ogg-bytes');

    const result = await service.normalizeIfNeeded(buffer, 'audio/ogg');

    expect(result).toBe(buffer);
  });

  it('falls back to the original buffer when ffmpeg cannot decode the input, instead of throwing', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const garbage = Buffer.from('not actually an mp4 file');

    const result = await service.normalizeIfNeeded(garbage, 'audio/mp4');

    expect(result).toBe(garbage);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('re-encode failed'));
  });

  // Regression: a browser-recorded MP4 streams its moov atom out unfinalized.
  // `file`/`afinfo` both call that audio valid, but WhatsApp's media-scrutiny
  // step silently rejects it after accepting the upload (error 131053,
  // "mediaEngineStatus: 0") — confirmed by hand by re-encoding the exact
  // same clip and having it deliver. This re-encodes a real one and checks
  // the output is itself a well-formed, differently-sized MP4 (ffmpeg
  // wouldn't produce fixed-size output byte-for-byte even on a no-op pass).
  it('re-encodes a real MP4 clip into a different, still-valid file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'audio-transcode-spec-'));
    const fixturePath = join(dir, 'fixture.m4a');
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(ffmpegPath!, [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'anullsrc=r=48000:cl=mono',
          '-t',
          '1',
          '-c:a',
          'aac',
          fixturePath,
        ]);
        proc.on('error', reject);
        proc.on('close', (code) =>
          code === 0 ? resolve() : reject(new Error(`fixture generation exited ${code}`)),
        );
      });
      const original = await readFile(fixturePath);

      const result = await service.normalizeIfNeeded(original, 'audio/mp4');

      expect(result).toBeInstanceOf(Buffer);
      expect(result.byteLength).toBeGreaterThan(0);
      expect(result.equals(original)).toBe(false);
      // MP4 files start with a size field then the 'ftyp' box type.
      expect(result.subarray(4, 8).toString('ascii')).toBe('ftyp');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 15000);
});
