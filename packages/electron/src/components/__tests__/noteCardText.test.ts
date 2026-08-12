import { getNoteCardText } from '@shared/index';

describe('getNoteCardText', () => {
  it('does not repeat the title in the preview', () => {
    const { title, preview } = getNoteCardText('Buy assortment kits\nThey are far cheaper than picking values.');
    expect(title).toBe('Buy assortment kits');
    expect(preview).toBe('They are far cheaper than picking values.');
    expect(preview).not.toContain(title);
  });

  it('returns an empty preview for a single-line note', () => {
    expect(getNoteCardText('Just the one line').preview).toBe('');
  });

  it('starts the preview after the title even when blank lines separate them', () => {
    const { title, preview } = getNoteCardText('\n\nTitle here\n\n\nBody starts here\n');
    expect(title).toBe('Title here');
    expect(preview).toBe('Body starts here');
  });

  it('strips leading markdown from the title', () => {
    expect(getNoteCardText('## ESP32-S3 Bridge Research').title).toBe('ESP32-S3 Bridge Research');
    expect(getNoteCardText('> quoted opening line').title).toBe('quoted opening line');
    expect(getNoteCardText('- [ ] unchecked task').title).toBe('unchecked task');
    expect(getNoteCardText('1. first step').title).toBe('first step');
  });

  it('leaves inline markdown and mid-line hashes alone', () => {
    expect(getNoteCardText('Ship **v0.5.4** today').title).toBe('Ship **v0.5.4** today');
    expect(getNoteCardText('Issue #13941 is merged').title).toBe('Issue #13941 is merged');
  });

  it('takes at most the two lines after the title', () => {
    expect(getNoteCardText('T\none\ntwo\nthree').preview).toBe('one two');
  });

  it('falls back to Untitled for empty or marker-only content', () => {
    expect(getNoteCardText('').title).toBe('Untitled');
    expect(getNoteCardText('   \n\n').title).toBe('Untitled');
    expect(getNoteCardText('## ').title).toBe('Untitled');
  });

  it('does not truncate — length is the stylesheet\'s job', () => {
    const long = 'x'.repeat(400);
    expect(getNoteCardText(long).title).toBe(long);
    expect(getNoteCardText(`T\n${long}`).preview).toBe(long);
  });
});
