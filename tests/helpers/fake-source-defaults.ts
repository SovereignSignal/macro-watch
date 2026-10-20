import { setBlockedPublisherDefaultsForTests } from '@/lib/security/blocked-publishers';
import { setPrivateSourceDefaultsForTests } from '@/lib/security/private-sources';

// The built-in guard lists ship hashed. Tests run against fictional stand-ins,
// installed through the same hashing path, so test files name no real sources.
setBlockedPublisherDefaultsForTests(
  [
  'northwire.com',
  'northwire',
  'ledger lines',
  'ledgerweek',
  'deskpicks',
  'desk picks',
  'dp research',
  'corvina',
  'cv101',
  'desk notes',
  'desknotes',
  'the halvorsen',
  'halvorsen.com',
  'halvorsen',
  ],
  ['halvorsen'],
);

setPrivateSourceDefaultsForTests([
  'dp',
  'corvina',
  'dp research',
  'desk picks',
  'deskpicks',
  'desk notes',
  'desknotes',
  'northwire',
  'northwire.com',
  'the halvorsen',
  'halvorsen',
  'halvorsen.com',
]);
