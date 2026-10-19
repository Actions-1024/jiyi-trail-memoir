// MediaRecorder writes WebM streams without a Duration element. Chrome can
// play them, but seeking and some share targets report an infinite duration.
// This tiny EBML patcher inserts a Duration into the Info element without
// re-encoding any media. It is deliberately conservative: if the structure is
// unexpected, the original blob is returned untouched.
const SEGMENT_ID = 0x18538067;
const INFO_ID = 0x1549a966;
const DURATION_ID = 0x4489;
const TIMECODE_SCALE_ID = 0x2ad7b1;

function readVint(bytes, pos, isId = false) {
  if (pos >= bytes.length) return null;
  const first = bytes[pos];
  let length = 1;
  let mask = 0x80;
  while (length <= 8 && !(first & mask)) {
    mask >>= 1;
    length++;
  }
  if (length > 8 || pos + length > bytes.length) return null;
  if (!isId) {
    let value = first & (mask - 1);
    let allOnes = value === mask - 1;
    for (let i = 1; i < length; i++) {
      value = value * 256 + bytes[pos + i];
      if (bytes[pos + i] !== 0xff) allOnes = false;
    }
    return { length, value, unknown: allOnes };
  }
  let value = 0;
  for (let i = 0; i < length; i++) value = value * 256 + bytes[pos + i];
  return { length, value, unknown: false };
}

function encodeSize(value, length) {
  const out = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i >= 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  if (v > 0) return null;
  out[0] |= 1 << (8 - length);
  return out;
}

function findElement(bytes, start, end, wantedId) {
  let pos = start;
  while (pos < end) {
    const id = readVint(bytes, pos, true);
    if (!id) return null;
    const size = readVint(bytes, pos + id.length, false);
    if (!size) return null;
    const dataStart = pos + id.length + size.length;
    const dataEnd = size.unknown ? end : dataStart + size.value;
    if (dataEnd > end) return null;
    if (id.value === wantedId) {
      return {
        start: pos,
        idLength: id.length,
        sizePos: pos + id.length,
        sizeLength: size.length,
        dataStart,
        dataEnd,
        sizeUnknown: size.unknown,
      };
    }
    pos = dataEnd;
  }
  return null;
}

function readInfo(bytes, info) {
  let pos = info.dataStart;
  let timecodeScale = 1_000_000;
  let durationElement = null;
  while (pos < info.dataEnd) {
    const id = readVint(bytes, pos, true);
    if (!id) break;
    const size = readVint(bytes, pos + id.length, false);
    if (!size) break;
    const dataStart = pos + id.length + size.length;
    const dataEnd = size.unknown ? info.dataEnd : dataStart + size.value;
    if (dataEnd > info.dataEnd) break;
    if (id.value === TIMECODE_SCALE_ID && size.value <= 8) {
      let value = 0;
      for (let i = 0; i < size.value; i++) value = value * 256 + bytes[dataStart + i];
      if (value > 0) timecodeScale = value;
    }
    if (id.value === DURATION_ID) {
      durationElement = { start: pos, dataStart, dataEnd, size: size.value };
    }
    pos = dataEnd;
  }
  return { timecodeScale, durationElement };
}

export async function fixWebmDuration(blob, durationSeconds) {
  if (!blob || !durationSeconds || durationSeconds <= 0) return blob;
  try {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const segment = findElement(bytes, 0, bytes.length, SEGMENT_ID);
    if (!segment) return blob;
    const info = findElement(bytes, segment.dataStart, bytes.length, INFO_ID);
    if (!info || info.sizeUnknown) return blob;
    const { timecodeScale, durationElement } = readInfo(bytes, info);
    const durationValue = (durationSeconds * 1_000_000_000) / timecodeScale;

    // If a duration is already present, patch its float value in place.
    if (durationElement && (durationElement.size === 4 || durationElement.size === 8)) {
      const out = bytes.slice();
      const view = new DataView(out.buffer);
      if (durationElement.size === 4) view.setFloat32(durationElement.dataStart, durationValue, false);
      else view.setFloat64(durationElement.dataStart, durationValue, false);
      return new Blob([out], { type: blob.type || 'video/webm' });
    }

    const durationBytes = new Uint8Array(11);
    durationBytes[0] = 0x44;
    durationBytes[1] = 0x89;
    durationBytes[2] = 0x84;
    new DataView(durationBytes.buffer).setFloat32(3, durationValue, false);

    const newInfoSize = (info.dataEnd - info.dataStart) + durationBytes.length;
    const infoSizeBytes = encodeSize(newInfoSize, info.sizeLength);
    if (!infoSizeBytes) return blob;

    let newSegmentSizeBytes = null;
    let newSegmentSize = null;
    if (!segment.sizeUnknown) {
      newSegmentSize = (segment.dataEnd - segment.dataStart) + durationBytes.length;
      newSegmentSizeBytes = encodeSize(newSegmentSize, segment.sizeLength);
      if (!newSegmentSizeBytes) return blob;
    }

    const out = new Uint8Array(bytes.length + durationBytes.length);
    out.set(bytes.subarray(0, info.dataEnd), 0);
    out.set(durationBytes, info.dataEnd);
    out.set(bytes.subarray(info.dataEnd), info.dataEnd + durationBytes.length);
    out.set(infoSizeBytes, info.sizePos);
    if (newSegmentSizeBytes) out.set(newSegmentSizeBytes, segment.sizePos);
    return new Blob([out], { type: blob.type || 'video/webm' });
  } catch (error) {
    console.warn('Could not patch WebM duration', error);
    return blob;
  }
}
