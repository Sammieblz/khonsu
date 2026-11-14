# MVP issue roadmap

User deadline: Sunday November 15, 2026 at 23:59. Planning timezone: America/New_York, pending event-portal verification. Aim for a release candidate at 20:00.

The [Kanban board](https://github.com/users/Sammieblz/projects/14) is the live work queue. All tickets are MVP work. P0 is the critical product path; P1 is the prepared cloud deployment path, with local fallback. Estimates total 57.5 engineering hours and assume parallel work by five engineers. Reassess after the first real sequence.

| Issue | Owner | Priority | Hours | Depends on |
| --- | --- | --- | --- | --- |
| [#1: Verify the scaffold and lock the team integration baseline](https://github.com/Sammieblz/khonsu/issues/1) | Tyrone A. Johnson | P0 | 1 | None |
| [#2: Implement Khonsu's original observatory visual system](https://github.com/Sammieblz/khonsu/issues/2) | Robel Mezgebe | P0 | 3 | [#1](https://github.com/Sammieblz/khonsu/issues/1) |
| [#3: Build target search, preset navigation and reproducible query URLs](https://github.com/Sammieblz/khonsu/issues/3) | Robel Mezgebe | P0 | 2 | [#1](https://github.com/Sammieblz/khonsu/issues/1), [#2](https://github.com/Sammieblz/khonsu/issues/2) |
| [#4: Implement bounded real SPHEREx retrieval from IRSA](https://github.com/Sammieblz/khonsu/issues/4) | Tyrone A. Johnson | P0 | 4 | [#1](https://github.com/Sammieblz/khonsu/issues/1) |
| [#5: Implement the sequence job lifecycle and generated API contract](https://github.com/Sammieblz/khonsu/issues/5) | Tyrone A. Johnson | P0 | 3 | [#1](https://github.com/Sammieblz/khonsu/issues/1) |
| [#6: Register real FITS observations onto a common celestial grid](https://github.com/Sammieblz/khonsu/issues/6) | Samuel Ndubuisi | P0 | 4 | [#1](https://github.com/Sammieblz/khonsu/issues/1) |
| [#7: Apply scientific masks, comparable wavelength selection and stable image rendering](https://github.com/Sammieblz/khonsu/issues/7) | Samuel Ndubuisi | P0 | 3 | [#6](https://github.com/Sammieblz/khonsu/issues/6) |
| [#8: Validate coverage and scientific suitability for all five required targets](https://github.com/Sammieblz/khonsu/issues/8) | Samuel Ndubuisi | P0 | 3 | [#4](https://github.com/Sammieblz/khonsu/issues/4), [#7](https://github.com/Sammieblz/khonsu/issues/7) |
| [#9: Package an authentic cached sequence and honest offline recovery](https://github.com/Sammieblz/khonsu/issues/9) | Samuel Ndubuisi | P0 | 2 | [#8](https://github.com/Sammieblz/khonsu/issues/8) |
| [#10: Implement the observation viewer and bounded frame-loading pipeline](https://github.com/Sammieblz/khonsu/issues/10) | Michael Ameteku | P0 | 3 | [#1](https://github.com/Sammieblz/khonsu/issues/1), [#5](https://github.com/Sammieblz/khonsu/issues/5) |
| [#11: Build the Khonsu time arc with real-epoch scrubbing and playback](https://github.com/Sammieblz/khonsu/issues/11) | Michael Ameteku | P0 | 3 | [#10](https://github.com/Sammieblz/khonsu/issues/10) |
| [#12: Add pan, zoom and truthful field-of-view geometry](https://github.com/Sammieblz/khonsu/issues/12) | Michael Ameteku | P0 | 2 | [#10](https://github.com/Sammieblz/khonsu/issues/10) |
| [#13: Implement crisp A/B blinking between authentic epochs](https://github.com/Sammieblz/khonsu/issues/13) | Michael Ameteku | P0 | 2 | [#10](https://github.com/Sammieblz/khonsu/issues/10) |
| [#14: Add local candidate marks with scientifically traceable coordinates](https://github.com/Sammieblz/khonsu/issues/14) | Aryan Pai | P0 | 3 | [#10](https://github.com/Sammieblz/khonsu/issues/10), [#12](https://github.com/Sammieblz/khonsu/issues/12) |
| [#15: Export a versioned evidence bundle and explain local sharing limits](https://github.com/Sammieblz/khonsu/issues/15) | Aryan Pai | P0 | 2 | [#14](https://github.com/Sammieblz/khonsu/issues/14) |
| [#16: Build provenance, quality explanations and responsible discovery guidance](https://github.com/Sammieblz/khonsu/issues/16) | Aryan Pai | P0 | 2 | [#5](https://github.com/Sammieblz/khonsu/issues/5), [#10](https://github.com/Sammieblz/khonsu/issues/10) |
| [#17: Connect search, job polling, sequences and recovery end to end](https://github.com/Sammieblz/khonsu/issues/17) | Tyrone A. Johnson | P0 | 3 | [#3](https://github.com/Sammieblz/khonsu/issues/3), [#4](https://github.com/Sammieblz/khonsu/issues/4), [#5](https://github.com/Sammieblz/khonsu/issues/5), [#7](https://github.com/Sammieblz/khonsu/issues/7), [#10](https://github.com/Sammieblz/khonsu/issues/10) |
| [#18: Finish responsive layout, keyboard access and reduced-motion behavior](https://github.com/Sammieblz/khonsu/issues/18) | Robel Mezgebe | P0 | 3 | [#2](https://github.com/Sammieblz/khonsu/issues/2), [#11](https://github.com/Sammieblz/khonsu/issues/11), [#12](https://github.com/Sammieblz/khonsu/issues/12), [#14](https://github.com/Sammieblz/khonsu/issues/14) |
| [#19: Verify the containerized local development and demo path](https://github.com/Sammieblz/khonsu/issues/19) | Tyrone A. Johnson | P0 | 1.5 | [#1](https://github.com/Sammieblz/khonsu/issues/1) |
| [#20: Prepare Cloudflare Pages and the container backend deployment path](https://github.com/Sammieblz/khonsu/issues/20) | Tyrone A. Johnson | P1 | 3 | [#17](https://github.com/Sammieblz/khonsu/issues/17), [#19](https://github.com/Sammieblz/khonsu/issues/19) |
| [#21: Run the final scientific, functional and accessibility acceptance pass](https://github.com/Sammieblz/khonsu/issues/21) | Aryan Pai | P0 | 3 | [#9](https://github.com/Sammieblz/khonsu/issues/9), [#13](https://github.com/Sammieblz/khonsu/issues/13), [#15](https://github.com/Sammieblz/khonsu/issues/15), [#16](https://github.com/Sammieblz/khonsu/issues/16), [#17](https://github.com/Sammieblz/khonsu/issues/17), [#18](https://github.com/Sammieblz/khonsu/issues/18), [#19](https://github.com/Sammieblz/khonsu/issues/19) |
| [#22: Finalize the reproducible demo, project story and submission evidence](https://github.com/Sammieblz/khonsu/issues/22) | Samuel Ndubuisi | P0 | 2 | [#20](https://github.com/Sammieblz/khonsu/issues/20), [#21](https://github.com/Sammieblz/khonsu/issues/21) |

## Start and handoff

Review the baseline first. Robel can then own visual composition and search; Tyrone can build archive retrieval and jobs; Samuel can build registration on local sample inputs. Michael can develop against the explicit synthetic contract while waiting for real frames. Aryan can develop the evidence model and guidance while coordinating the viewer coordinate seam. A declared dependency means acceptance needs the upstream output, not that useful isolated work must stop.

Move an issue to Ready when its input is available, In progress while active, In review with a PR and evidence, and Done after merge and acceptance. Do not close scientific tickets with development fixtures. Existing project workflows can add new repository issues automatically.

## Assignment prerequisites

Samuel's GitHub account is verified and his science tickets are assigned. Tyrone and Aryan have pending repository invitations. GitHub rejected assignment to a pending invite. Michael has two invited accounts, requiring confirmation, and Robel's account is unverified. Until identities and access are resolved, every ticket names its human owner in its body. Do not substitute the repository owner or guess a handle.

