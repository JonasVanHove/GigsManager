import { describe, it, expect } from 'vitest';

// ─── Band Status ────────────────────────────────────────────────────────────
import {
  parseBandStatus,
  encodeBandStatusTag,
  cleanChatUrl,
  embedStatusInChatUrl,
  type BandStatus,
  type BandStatusDetails,
} from '../src/lib/band-status';

describe('Band Status', () => {
  describe('parseBandStatus', () => {
    it('returns "active" for band with explicit active status', () => {
      const result = parseBandStatus({ status: 'active' });
      expect(result.status).toBe('active');
      expect(result.disbandedAt).toBeNull();
    });

    it('returns "inactive" for band with explicit inactive status', () => {
      const result = parseBandStatus({ status: 'inactive' });
      expect(result.status).toBe('inactive');
    });

    it('returns "disbanded" for band with disbanded status and date', () => {
      const result = parseBandStatus({
        status: 'disbanded',
        disbandedAt: '2024-06-15T00:00:00Z',
      });
      expect(result.status).toBe('disbanded');
      expect(result.disbandedAt).toContain('2024-06-15');
    });

    it('defaults to "active" for band with no status fields', () => {
      const result = parseBandStatus({});
      expect(result.status).toBe('active');
      expect(result.disbandedAt).toBeNull();
    });

    it('falls back to embedded status in chatUrl when no status column', () => {
      const chatUrl = 'https://chat.example.com <!--band-status:{"status":"inactive","statusNote":"Pauze tot januari"}-->';
      const result = parseBandStatus({ chatUrl });
      expect(result.status).toBe('inactive');
      expect(result.statusNote).toBe('Pauze tot januari');
    });

    it('handles malformed chatUrl metadata gracefully', () => {
      const result = parseBandStatus({ chatUrl: '<!--band-status:broken-->' });
      expect(result.status).toBe('active');
    });

    it('handles Date object for disbandedAt', () => {
      const result = parseBandStatus({
        status: 'disbanded',
        disbandedAt: new Date('2025-01-01'),
      });
      expect(result.status).toBe('disbanded');
      expect(result.disbandedAt).toContain('2025-01-01');
    });
  });

  describe('encodeBandStatusTag', () => {
    it('encodes status details into an HTML comment tag', () => {
      const tag = encodeBandStatusTag({ status: 'inactive', disbandedAt: null });
      expect(tag).toContain('<!--band-status:');
      expect(tag).toContain('"inactive"');
    });
  });

  describe('cleanChatUrl', () => {
    it('strips status tag and returns clean URL', () => {
      const cleaned = cleanChatUrl('https://chat.example.com <!--band-status:{"status":"active"}-->');
      expect(cleaned).toBe('https://chat.example.com');
    });

    it('returns null for empty chatUrl', () => {
      expect(cleanChatUrl(null)).toBeNull();
      expect(cleanChatUrl('')).toBeNull();
    });
  });

  describe('embedStatusInChatUrl', () => {
    it('embeds status into an existing chatUrl', () => {
      const result = embedStatusInChatUrl('https://chat.example.com', { status: 'inactive', disbandedAt: null });
      expect(result).toContain('https://chat.example.com');
      expect(result).toContain('<!--band-status:');
    });

    it('embeds status when chatUrl is null', () => {
      const result = embedStatusInChatUrl(null, { status: 'disbanded', disbandedAt: '2024-12-01' });
      expect(result).toContain('<!--band-status:');
      expect(result).toContain('"disbanded"');
    });
  });
});

// ─── Lineup Manager ─────────────────────────────────────────────────────────
import {
  parseMemberLineup,
  serializeMemberLineupNotes,
  getMemberLineupForBand,
  evaluateMemberAvailability,
  type MemberLineup,
} from '../src/lib/lineup-manager';

describe('Lineup Manager', () => {
  describe('parseMemberLineup', () => {
    it('returns empty map for null notes', () => {
      const { cleanNotes, lineupByBand } = parseMemberLineup(null);
      expect(cleanNotes).toBe('');
      expect(Object.keys(lineupByBand)).toHaveLength(0);
    });

    it('returns plain text as cleanNotes when no lineup tag', () => {
      const { cleanNotes, lineupByBand } = parseMemberLineup('Speelt gitaar');
      expect(cleanNotes).toBe('Speelt gitaar');
      expect(Object.keys(lineupByBand)).toHaveLength(0);
    });

    it('parses lineup tag from notes', () => {
      const notes = 'Speelt gitaar\n\n<!--lineup:{"The Vibes":{"status":"active"}}-->';
      const { cleanNotes, lineupByBand } = parseMemberLineup(notes);
      expect(cleanNotes).toBe('Speelt gitaar');
      expect(lineupByBand['The Vibes']?.status).toBe('active');
    });
  });

  describe('serializeMemberLineupNotes', () => {
    it('serializes lineup data back into notes', () => {
      const result = serializeMemberLineupNotes('Speelt gitaar', {
        'The Vibes': { status: 'active' },
      });
      expect(result).toContain('Speelt gitaar');
      expect(result).toContain('<!--lineup:');
      expect(result).toContain('"active"');
    });

    it('returns only clean notes if lineup map is empty', () => {
      const result = serializeMemberLineupNotes('Speelt gitaar', {});
      expect(result).toBe('Speelt gitaar');
    });
  });

  describe('getMemberLineupForBand', () => {
    it('returns default active if no lineup for band', () => {
      const result = getMemberLineupForBand(null, 'SomeBand');
      expect(result.status).toBe('active');
    });

    it('returns lineup data for the specific band', () => {
      const notes = '<!--lineup:{"MegaRock":{"status":"temporary_absence","absenceStartDate":"2025-01-01","absenceEndDate":"2025-03-01"}}-->';
      const result = getMemberLineupForBand(notes, 'MegaRock');
      expect(result.status).toBe('temporary_absence');
      expect(result.absenceStartDate).toBe('2025-01-01');
      expect(result.absenceEndDate).toBe('2025-03-01');
    });
  });

  describe('evaluateMemberAvailability', () => {
    it('marks active member as available', () => {
      const result = evaluateMemberAvailability({ status: 'active' }, '2025-06-15');
      expect(result.available).toBe(true);
      expect(result.status).toBe('active');
    });

    it('marks undefined lineup as available', () => {
      const result = evaluateMemberAvailability(undefined, '2025-06-15');
      expect(result.available).toBe(true);
    });

    // ── Departed scenarios ──

    it('marks departed member as unavailable on/after departure date', () => {
      const lineup: MemberLineup = { status: 'departed', departureDate: '2025-03-01' };
      expect(evaluateMemberAvailability(lineup, '2025-03-01').available).toBe(false);
      expect(evaluateMemberAvailability(lineup, '2025-04-15').available).toBe(false);
      expect(evaluateMemberAvailability(lineup, '2025-04-15').badgeLabel).toContain('Gestopt');
    });

    it('marks departed member as available before departure date', () => {
      const lineup: MemberLineup = { status: 'departed', departureDate: '2025-03-01' };
      expect(evaluateMemberAvailability(lineup, '2025-02-28').available).toBe(true);
    });

    it('marks departed member without date as unavailable', () => {
      const lineup: MemberLineup = { status: 'departed' };
      expect(evaluateMemberAvailability(lineup).available).toBe(false);
      expect(evaluateMemberAvailability(lineup).badgeLabel).toBe('Gestopt');
    });

    // ── Temporary absence scenarios ──

    it('marks member as unavailable during temporary absence window', () => {
      const lineup: MemberLineup = {
        status: 'temporary_absence',
        absenceStartDate: '2025-01-10',
        absenceEndDate: '2025-02-10',
      };
      expect(evaluateMemberAvailability(lineup, '2025-01-15').available).toBe(false);
      expect(evaluateMemberAvailability(lineup, '2025-01-15').reason).toContain('Tijdelijk afwezig');
    });

    it('marks member as available before absence window', () => {
      const lineup: MemberLineup = {
        status: 'temporary_absence',
        absenceStartDate: '2025-01-10',
        absenceEndDate: '2025-02-10',
      };
      expect(evaluateMemberAvailability(lineup, '2025-01-09').available).toBe(true);
    });

    it('marks member as available after absence window', () => {
      const lineup: MemberLineup = {
        status: 'temporary_absence',
        absenceStartDate: '2025-01-10',
        absenceEndDate: '2025-02-10',
      };
      expect(evaluateMemberAvailability(lineup, '2025-02-11').available).toBe(true);
    });

    it('handles open-ended absence (no end date)', () => {
      const lineup: MemberLineup = {
        status: 'temporary_absence',
        absenceStartDate: '2025-01-10',
      };
      expect(evaluateMemberAvailability(lineup, '2025-01-10').available).toBe(false);
      expect(evaluateMemberAvailability(lineup, '2025-06-15').available).toBe(false);
      expect(evaluateMemberAvailability(lineup, '2025-01-09').available).toBe(true);
    });

    it('handles absence with only end date', () => {
      const lineup: MemberLineup = {
        status: 'temporary_absence',
        absenceEndDate: '2025-02-10',
      };
      expect(evaluateMemberAvailability(lineup, '2025-02-09').available).toBe(false);
      expect(evaluateMemberAvailability(lineup, '2025-02-11').available).toBe(true);
    });

    it('handles absence with no dates at all', () => {
      const lineup: MemberLineup = { status: 'temporary_absence' };
      const result = evaluateMemberAvailability(lineup);
      expect(result.available).toBe(false);
      expect(result.badgeLabel).toBe('Afwezig');
    });

    it('accepts Date object as targetDate', () => {
      const lineup: MemberLineup = {
        status: 'temporary_absence',
        absenceStartDate: '2025-01-10',
        absenceEndDate: '2025-02-10',
      };
      expect(evaluateMemberAvailability(lineup, new Date('2025-01-15')).available).toBe(false);
      expect(evaluateMemberAvailability(lineup, new Date('2025-02-11')).available).toBe(true);
    });
  });
});

// ─── Attachment Sharing ─────────────────────────────────────────────────────
import {
  parseAttachmentSharingMeta,
  serializeAttachmentSharingDescription,
  canViewerAccessAttachment,
  type AttachmentSharingMeta,
} from '../src/lib/setlist-attachments-sharing';

describe('Attachment Sharing', () => {
  const ownerMeta: AttachmentSharingMeta = {
    userId: 'user-1',
    userName: 'Jan',
    scope: 'private',
    sharedWith: [],
  };

  describe('parseAttachmentSharingMeta', () => {
    it('returns null meta for empty/null description', () => {
      expect(parseAttachmentSharingMeta(null).meta).toBeNull();
      expect(parseAttachmentSharingMeta('').meta).toBeNull();
      expect(parseAttachmentSharingMeta(undefined).meta).toBeNull();
    });

    it('returns null meta for description without sharing tag', () => {
      const { cleanDescription, meta } = parseAttachmentSharingMeta('Just a guitar tab');
      expect(cleanDescription).toBe('Just a guitar tab');
      expect(meta).toBeNull();
    });

    it('parses sharing metadata from description', () => {
      const desc = serializeAttachmentSharingDescription('Guitar tab', ownerMeta);
      const { cleanDescription, meta } = parseAttachmentSharingMeta(desc);
      expect(cleanDescription).toBe('Guitar tab');
      expect(meta?.userId).toBe('user-1');
      expect(meta?.scope).toBe('private');
    });
  });

  describe('serializeAttachmentSharingDescription', () => {
    it('serializes meta into description', () => {
      const desc = serializeAttachmentSharingDescription('My chart', ownerMeta);
      expect(desc).toContain('My chart');
      expect(desc).toContain('<!--attachment-sharing:');
    });

    it('handles null description', () => {
      const desc = serializeAttachmentSharingDescription(null, ownerMeta);
      expect(desc).toContain('<!--attachment-sharing:');
    });
  });

  describe('canViewerAccessAttachment', () => {
    it('allows access to legacy attachments (no meta)', () => {
      expect(canViewerAccessAttachment(null, { userId: 'any-user' })).toBe(true);
    });

    it('allows uploader to access their own private attachment', () => {
      expect(canViewerAccessAttachment(ownerMeta, { userId: 'user-1' })).toBe(true);
    });

    it('denies other user access to private attachment', () => {
      expect(canViewerAccessAttachment(ownerMeta, { userId: 'user-2' })).toBe(false);
    });

    it('allows band member access to band-shared attachment', () => {
      const bandMeta: AttachmentSharingMeta = { ...ownerMeta, scope: 'band' };
      expect(canViewerAccessAttachment(bandMeta, { userId: 'user-2' })).toBe(true);
    });

    it('allows selected member access to selectively-shared attachment', () => {
      const selectedMeta: AttachmentSharingMeta = {
        ...ownerMeta,
        scope: 'selected',
        sharedWith: ['user-3', 'member-5'],
      };
      expect(canViewerAccessAttachment(selectedMeta, { userId: 'user-3' })).toBe(true);
      expect(canViewerAccessAttachment(selectedMeta, { userId: 'user-4', memberIds: ['member-5'] })).toBe(true);
      expect(canViewerAccessAttachment(selectedMeta, { userId: 'user-4' })).toBe(false);
    });
  });
});

// ─── User Notes ─────────────────────────────────────────────────────────────
import {
  parseSetlistItemNotes,
  serializeSetlistItemNotes,
  getUserNoteForViewer,
  setUserNoteForViewer,
} from '../src/lib/setlist-user-notes';

describe('Setlist User Notes', () => {
  describe('parseSetlistItemNotes', () => {
    it('returns empty general note for null', () => {
      const result = parseSetlistItemNotes(null);
      expect(result.generalNote).toBe('');
      expect(Object.keys(result.userNotes)).toHaveLength(0);
    });

    it('returns raw text as general note when no user notes tag', () => {
      const result = parseSetlistItemNotes('Play soft here');
      expect(result.generalNote).toBe('Play soft here');
      expect(Object.keys(result.userNotes)).toHaveLength(0);
    });

    it('parses user notes from raw string', () => {
      const rawNotes = 'General instruction\n\n<!--user-notes:{"user-1":{"note":"Capo 2"},"user-2":{"note":"Fill here"}}-->';
      const result = parseSetlistItemNotes(rawNotes);
      expect(result.generalNote).toBe('General instruction');
      expect(result.userNotes['user-1']?.note).toBe('Capo 2');
      expect(result.userNotes['user-2']?.note).toBe('Fill here');
    });
  });

  describe('serializeSetlistItemNotes', () => {
    it('serializes user notes with general note', () => {
      const result = serializeSetlistItemNotes('General', {
        'user-1': { note: 'My note' },
      });
      expect(result).toContain('General');
      expect(result).toContain('<!--user-notes:');
      expect(result).toContain('"My note"');
    });

    it('returns only general note when no user notes', () => {
      const result = serializeSetlistItemNotes('General', {});
      expect(result).toBe('General');
    });
  });

  describe('getUserNoteForViewer', () => {
    const rawNotes = 'Shared note\n\n<!--user-notes:{"user-1":{"note":"My private note"}}-->';

    it('returns general note and user note for the viewer', () => {
      const { generalNote, userNote } = getUserNoteForViewer(rawNotes, 'user-1');
      expect(generalNote).toBe('Shared note');
      expect(userNote).toBe('My private note');
    });

    it('returns empty user note for other users', () => {
      const { generalNote, userNote } = getUserNoteForViewer(rawNotes, 'user-2');
      expect(generalNote).toBe('Shared note');
      expect(userNote).toBe('');
    });

    it('returns empty user note when userId is null', () => {
      const { userNote } = getUserNoteForViewer(rawNotes, null);
      expect(userNote).toBe('');
    });
  });

  describe('setUserNoteForViewer', () => {
    it('sets a user note for a specific viewer', () => {
      const result = setUserNoteForViewer('General instruction', 'user-1', 'Capo 3');
      const parsed = parseSetlistItemNotes(result);
      expect(parsed.generalNote).toBe('General instruction');
      expect(parsed.userNotes['user-1']?.note).toBe('Capo 3');
    });

    it('removes user note when new note is empty', () => {
      const withNote = setUserNoteForViewer('General', 'user-1', 'My note');
      const cleared = setUserNoteForViewer(withNote, 'user-1', '');
      const parsed = parseSetlistItemNotes(cleared);
      expect(parsed.userNotes['user-1']).toBeUndefined();
    });

    it('preserves notes from other users', () => {
      const rawNotes = 'General\n\n<!--user-notes:{"user-2":{"note":"Drummer cue"}}-->';
      const result = setUserNoteForViewer(rawNotes, 'user-1', 'Guitar tab');
      const parsed = parseSetlistItemNotes(result);
      expect(parsed.userNotes['user-1']?.note).toBe('Guitar tab');
      expect(parsed.userNotes['user-2']?.note).toBe('Drummer cue');
    });
  });
});

// ─── Roundtrip consistency ──────────────────────────────────────────────────
describe('Roundtrip consistency', () => {
  it('band status survives encode → chatUrl → parse cycle', () => {
    const details: BandStatusDetails = {
      status: 'disbanded',
      disbandedAt: '2024-12-15T00:00:00.000Z',
      statusNote: 'Band uit elkaar',
    };
    const chatUrl = embedStatusInChatUrl('https://discord.gg/abc', details);
    const parsed = parseBandStatus({ chatUrl });
    expect(parsed.status).toBe('disbanded');
    expect(parsed.statusNote).toBe('Band uit elkaar');
    // And the clean URL is recovered
    expect(cleanChatUrl(chatUrl)).toBe('https://discord.gg/abc');
  });

  it('lineup survives serialize → parse cycle', () => {
    const original = { 'BandX': { status: 'temporary_absence' as const, absenceStartDate: '2025-02-01', absenceEndDate: '2025-03-01' } };
    const serialized = serializeMemberLineupNotes('Plays drums', original);
    const { cleanNotes, lineupByBand } = parseMemberLineup(serialized);
    expect(cleanNotes).toBe('Plays drums');
    expect(lineupByBand['BandX']?.status).toBe('temporary_absence');
    expect(lineupByBand['BandX']?.absenceStartDate).toBe('2025-02-01');
  });

  it('user notes survive serialize → parse → setUserNote cycle', () => {
    const initial = serializeSetlistItemNotes('Start slow', {
      'user-a': { note: 'Capo 2', updatedAt: '2025-01-01T00:00:00Z' },
    });
    // Another user adds a note
    const updated = setUserNoteForViewer(initial, 'user-b', 'Mute strings');
    const parsed = parseSetlistItemNotes(updated);
    expect(parsed.generalNote).toBe('Start slow');
    expect(parsed.userNotes['user-a']?.note).toBe('Capo 2');
    expect(parsed.userNotes['user-b']?.note).toBe('Mute strings');
  });

  it('attachment sharing survives serialize → parse cycle', () => {
    const meta: AttachmentSharingMeta = {
      userId: 'usr-42',
      userName: 'Piet',
      instrument: 'Drums',
      scope: 'selected',
      sharedWith: ['usr-43', 'usr-44'],
      caption: 'Drum chart v2',
    };
    const desc = serializeAttachmentSharingDescription('Practice sheet', meta);
    const { cleanDescription, meta: parsed } = parseAttachmentSharingMeta(desc);
    expect(cleanDescription).toBe('Practice sheet');
    expect(parsed?.userId).toBe('usr-42');
    expect(parsed?.scope).toBe('selected');
    expect(parsed?.sharedWith).toEqual(['usr-43', 'usr-44']);
    expect(parsed?.instrument).toBe('Drums');
  });
});
