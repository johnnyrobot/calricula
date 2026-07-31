export class WranglerConfigError extends Error {}

function stripJsoncComments(text) {
  let output = '';
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (lineComment) {
      if (character === '\n' || character === '\r') {
        lineComment = false;
        output += character;
      } else {
        output += ' ';
      }
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        output += '  ';
        index += 1;
        blockComment = false;
      } else {
        output +=
          character === '\n' || character === '\r' ? character : ' ';
      }
      continue;
    }
    if (inString) {
      output += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }
    if (character === '/' && next === '/') {
      output += '  ';
      index += 1;
      lineComment = true;
      continue;
    }
    if (character === '/' && next === '*') {
      output += '  ';
      index += 1;
      blockComment = true;
      continue;
    }
    output += character;
  }
  if (blockComment || inString) {
    throw new WranglerConfigError(
      'wrangler.jsonc contains an unterminated comment or string.',
    );
  }
  return output;
}

function stripTrailingCommas(text) {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      output += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }
    if (character === ',') {
      let lookahead = index + 1;
      while (/\s/.test(text[lookahead] ?? '')) {
        lookahead += 1;
      }
      if (text[lookahead] === '}' || text[lookahead] === ']') {
        output += ' ';
        continue;
      }
    }
    output += character;
  }
  return output;
}

export function parseWranglerJsonc(text) {
  if (typeof text !== 'string') {
    throw new WranglerConfigError(
      'wrangler.jsonc must be provided as text.',
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(
      stripTrailingCommas(stripJsoncComments(text)),
    );
  } catch (error) {
    if (error instanceof WranglerConfigError) throw error;
    throw new WranglerConfigError(
      'wrangler.jsonc is not valid JSONC.',
    );
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new WranglerConfigError(
      'wrangler.jsonc must contain one configuration object.',
    );
  }
  return parsed;
}
