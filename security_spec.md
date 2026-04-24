# Security Specification: Checkmate Tournament Manager

## 1. Data Invariants
- A tournament must have a name, ID, and format.
- A tournament must belong to an authenticated and verified owner.
- The `ownerId` of a tournament cannot be changed once created.
- The number of players is limited to 64 (to prevent resource exhaustion).
- The number of games is limited to 2000.

## 2. The Dirty Dozen (Vulnerable Payloads)

1. **Identity Spoofing**: Attempt to create a tournament with someone else's `ownerId`.
2. **Unverified Creation**: Attempt to create a tournament with an unverified email.
3. **Owner Stealing**: Attempt to update an existing tournament's `ownerId` to yourself.
4. **Anonymous Write**: Attempt to create/update without being signed in.
5. **ID Poisoning**: Attempt to use a 1MB string as a document ID.
6. **Player Bloating**: Attempt to add 10,000 players to a tournament.
7. **Game Bloating**: Attempt to add 50,000 game records.
8. **Invalid Format**: Attempt to set `formatType` to "triple-knockout" (not supported).
9. **Malicious Strings**: Attempt to inject heavy HTML/Scripts into the `tournamentName`.
10. **State Poisoning**: Attempt to update a tournament's results as a non-owner.
11. **Timestamp Spoofing**: Attempt to set `updatedAt` to a future date manually (should use `request.time`).
12. **Blanket Querying**: Attempt to list all tournaments in the database.

## 3. Test Cases (TDD)
A `firestore.rules.test.ts` (conceptual) would verify that all the above payloads return `PERMISSION_DENIED`.
