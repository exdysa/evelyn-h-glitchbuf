import { readFile } from 'fs/promises';
import { processImage } from './process.js';
function parseFlags(): Record<string, string> {
  const flags: Record<string, string> = {};
  const args = process.argv.slice(2);
  let i = 0;

  while (i < args.length) {
    const arg = args[i].replace(/^--?/, '');
    const [key, val] = arg.split('=');

    if (val !== undefined) {
      flags[key] = val;
      i++;
      continue;
    }

    // No '=' — value is the next arg
    const next = args[i + 1];
    if (next && !next.startsWith('-')) {
      flags[key] = next;
      i += 2;
      continue;
    }

    throw new Error(`Missing value for flag: --${key}`);
  }

  return flags;
}

async function main() {
  const flags = parseFlags();
  const input = flags.input ?? flags.i;
  const output = flags.output ?? flags.o;
  const sequencesPath = flags.sequences ?? flags.s;

  if (!input || !output || !sequencesPath) {
    console.error('Usage: --input <path> --output <path> --sequences <path>');
    process.exit(1);
  }

  try {
    const sequencesData = await readFile(sequencesPath, 'utf8');
    const sequences = JSON.parse(sequencesData);
    await processImage(input, output, sequences);
    console.log('Processing complete.');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();