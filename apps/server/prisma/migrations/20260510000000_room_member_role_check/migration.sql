-- Enforce the RBAC matrix at the database layer: RoomMember.role
-- accepts only the two non-GM roles. GM is detected via Room.ownerId.
-- Without this CHECK any code path that bypassed the
-- service layer (raw SQL, future migrations, manual admin tooling) could
-- silently insert an unrecognised role string and reach the runtime as a
-- "Player" by the `role === 'Observer' ? 'Observer' : 'Player'` fallback.
ALTER TABLE "RoomMember"
    ADD CONSTRAINT "RoomMember_role_check"
    CHECK ("role" IN ('Player', 'Observer'));
