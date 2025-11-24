// scripts/validate_playbook.ts
import fs from "fs";

const SCHEMA_MIN = {
    required: ["steps"],
};

function validate(pb: any) {
    if (!pb.steps || !Array.isArray(pb.steps)) throw new Error("playbook.dsl.steps is required and must be array");

    for (const s of pb.steps) {
        if (!s.type) throw new Error("each step must have type");
        if (s.type === "create_approval" && (!s.params || !s.params.required_roles)) {
            throw new Error("create_approval must have params.required_roles");
        }
    }
    return true;
}

(async () => {
    const path = process.argv[2];
    if (!path) {
        console.error("Usage: node scripts/validate_playbook.js ./playbook.json");
        process.exit(1);
    }

    const raw = fs.readFileSync(path, 'utf8');
    const pb = JSON.parse(raw);

    try {
        validate(pb);
        console.log("Playbook OK");
        process.exit(0);
    } catch (e: any) {
        console.error("Playbook validation error:", e.message);
        process.exit(2);
    }
})();