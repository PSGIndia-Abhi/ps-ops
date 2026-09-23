import { levelFor, milestoneBadges } from '../src/screens/technician/levels';
import { formatShiftClock, formatWorked } from '../src/screens/technician/shiftTime';

describe('levelFor', () => {
  it('starts at Rookie and shows progress to the next level', () => {
    expect(levelFor(0)).toMatchObject({ number: 1, name: 'Rookie', toNext: 5, percent: 0 });
    expect(levelFor(2)).toMatchObject({ name: 'Rookie', toNext: 3, percent: 40 });
  });

  it('moves up at exactly the threshold', () => {
    expect(levelFor(5)).toMatchObject({ number: 2, name: 'Rising Star', toNext: 15, percent: 0 });
    expect(levelFor(18)).toMatchObject({ name: 'Rising Star', toNext: 2, percent: 87 });
    expect(levelFor(20)).toMatchObject({ number: 3, name: 'Pro' });
  });

  it('tops out at Master with a full bar', () => {
    expect(levelFor(100)).toMatchObject({ number: 5, name: 'Master', next: null, toNext: 0, percent: 100 });
    expect(levelFor(400).percent).toBe(100);
  });
});

describe('milestoneBadges', () => {
  it('marks earned badges and counts jobs still to go', () => {
    const badges = milestoneBadges(18);
    expect(badges.map(b => b.earned)).toEqual([true, true, false, false, false]);
    expect(badges[0].label).toBe('First job');
    expect(badges[2]).toMatchObject({ target: 25, remaining: 7 });
    expect(badges[1].remaining).toBe(0);
  });
});

describe('shift time formatting', () => {
  it('shows a running clock', () => {
    expect(formatShiftClock(0)).toBe('00:00:00');
    expect(formatShiftClock((3 * 3600 + 24 * 60 + 10) * 1000)).toBe('03:24:10');
    expect(formatShiftClock(-5000)).toBe('00:00:00');
  });

  it('summarises time worked in plain words', () => {
    expect(formatWorked(30 * 1000)).toBe('Less than a minute');
    expect(formatWorked(45 * 60000)).toBe('45m');
    expect(formatWorked((6 * 60 + 12) * 60000)).toBe('6h 12m');
  });
});
