# Port Registry

Every tool runs on its own fixed localhost ports so any tool can be started, demoed and screen-recorded independently — and several can run side by side without collisions.

| Range | Purpose | Rule |
|---|---|---|
| `30NN` | App / frontend | Always used. Pinned in the dev script with strict-port behaviour. |
| `40NN` | Separate API / worker | Only if the architecture needs a standalone backend. |
| `54NN` | Local database / other service | Only if a local DB (e.g. Postgres in Docker) is used. |
| `25NN` | Local SMTP (mail catcher) | Only if the tool sends email in development. The catcher's web inbox uses `40NN` when the tool has no separate API. |

Port `3000` is never used — too many tools default to it.

| # | Folder | App URL | API | DB |
|---|---|---|---|---|
| 01 | tool-01-event-management | http://localhost:3001 | 4001 | 5401 |
| 02 | tool-02-b2b-saas | http://localhost:3002 | 4002 | 5402 |
| 03 | tool-03 | http://localhost:3003 | 4003 | 5403 |
| 04 | tool-04 | http://localhost:3004 | 4004 | 5404 |
| 05 | tool-05 | http://localhost:3005 | 4005 | 5405 |
| 06 | tool-06 | http://localhost:3006 | 4006 | 5406 |
| 07 | tool-07 | http://localhost:3007 | 4007 | 5407 |
| 08 | tool-08 | http://localhost:3008 | 4008 | 5408 |
| 09 | tool-09 | http://localhost:3009 | 4009 | 5409 |
| 10 | tool-10 | http://localhost:3010 | 4010 | 5410 |
| 11 | tool-11 | http://localhost:3011 | 4011 | 5411 |
| 12 | tool-12 | http://localhost:3012 | 4012 | 5412 |
| 13 | tool-13 | http://localhost:3013 | 4013 | 5413 |
| 14 | tool-14 | http://localhost:3014 | 4014 | 5414 |
| 15 | tool-15 | http://localhost:3015 | 4015 | 5415 |
| 16 | tool-16 | http://localhost:3016 | 4016 | 5416 |
| 17 | tool-17 | http://localhost:3017 | 4017 | 5417 |
| 18 | tool-18 | http://localhost:3018 | 4018 | 5418 |
| 19 | tool-19 | http://localhost:3019 | 4019 | 5419 |
| 20 | tool-20 | http://localhost:3020 | 4020 | 5420 |
| 21 | tool-21 | http://localhost:3021 | 4021 | 5421 |
| 22 | tool-22 | http://localhost:3022 | 4022 | 5422 |
| 23 | tool-23 | http://localhost:3023 | 4023 | 5423 |
| 24 | tool-24 | http://localhost:3024 | 4024 | 5424 |
| 25 | tool-25 | http://localhost:3025 | 4025 | 5425 |
| 26 | tool-26 | http://localhost:3026 | 4026 | 5426 |
| 27 | tool-27 | http://localhost:3027 | 4027 | 5427 |
| 28 | tool-28 | http://localhost:3028 | 4028 | 5428 |
| 29 | tool-29 | http://localhost:3029 | 4029 | 5429 |
| 30 | tool-30 | http://localhost:3030 | 4030 | 5430 |
