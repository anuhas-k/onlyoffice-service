// Compare two stored versions of a .docx: read both snapshots, pull out the paragraph text, diff it.
// Independent of the editing protocol — a version is just bytes the Document Server (or, later, Microsoft's editor) saved.
import { extractParagraphs, DocxError } from './docx-text.js';
import { diffParagraphs, DiffError } from './text-diff.js';
import { HttpError } from './common.js';

async function paragraphsOf(store, fileId, version) {
  try {
    return extractParagraphs(await store.readVersion(fileId, version.id));
  } catch (err) {
    if (err instanceof DocxError) throw new HttpError(422, 'DocxUnreadable', 'This version could not be read as a Word document');
    throw err;
  }
}

/** @param {object} file store file  @param {object} to the version being viewed  @param {object|null} from the version to compare with (null = nothing before) */
export async function diffVersions(store, file, to, from) {
  const toParagraphs = await paragraphsOf(store, file.id, to);
  const fromParagraphs = from ? await paragraphsOf(store, file.id, from) : [];
  try {
    const { stats, lines } = diffParagraphs(fromParagraphs, toParagraphs);
    const brief = (v) => ({ id: v.id, kind: v.kind, createdAt: v.createdAt, participants: v.participants });
    return { file: { id: file.id, name: file.name }, from: from ? brief(from) : null, to: brief(to), stats, lines };
  } catch (err) {
    if (err instanceof DiffError) throw new HttpError(422, 'DiffTooLarge', 'These two versions differ too much to compare');
    throw err;
  }
}
