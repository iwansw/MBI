# Security Specification for MBI Service Center

## Data Invariants
1. Service Requests must have a valid request number and customer name.
2. Only Admins can manage users and global settings.
3. Technicians can only update service requests assigned to them or log activities.
4. Billing can only be marked as PAID by Admins or authorized roles.
5. All IDs must be correctly formatted strings.

## The "Dirty Dozen" Payloads

1. **Identity Theft**: Attempt to create a user profile with an existing admin UID but different role.
2. **Shadow Field**: Adding `is_admin: true` to a regular user document.
3. **Ghost Update**: Updating `request_number` on an existing service request.
4. **Illegal Join**: Assigning a technician to a request who doesn't exist in the users collection.
5. **PII Leak**: An unauthenticated user attempting to list all `users`.
6. **Status Shortcut**: Moving a request from `PENDING` directly to `COMPLETED` without being the assigned technician.
7. **Resource Poisoning**: Sending a 2MB string as a `service_notes` update.
8. **Orphaned Part**: Adding a part to a service request that doesn't exist in the `service_requests` collection.
9. **Fake Payment**: Updating a billing document's status to `PAID` as a technician.
10. **Global Lockout**: Deleting the `company_name` setting as a non-admin.
11. **Spoofed Timestamp**: Manually setting `created_at` to a date in the future.
12. **Id Poisoning**: Using a 1KB string as a document ID for a new service request.

## Test Runner
(See firestore.rules.test.ts for implementation)
