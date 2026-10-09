import { SYLLABUS } from "../src/lib/student-os/syllabus";
for (const s of SYLLABUS) console.log(s.id, s.name, s.paper, s.totalItems);
console.log("ALL", SYLLABUS.reduce((a, s) => a + s.totalItems, 0));
