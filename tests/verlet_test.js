
// tests/verlet_test.js
// Mock Entities
const e1 = { x: 100, y: 100 };
const e2 = { x: 200, y: 100 };

// Verlet Logic (Copied from source for isolation)
const resolveDistance = (e1, e2, targetDist, stiffness = 0.5) => {
    const dx = e1.x - e2.x;
    const dy = e1.y - e2.y;
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq);

    if (dist === 0) return;

    const diff = (dist - targetDist) / dist;
    const correction = diff * stiffness;

    const offsetX = dx * correction * 0.5;
    const offsetY = dy * correction * 0.5;

    e1.x -= offsetX;
    e1.y -= offsetY;
    e2.x += offsetX;
    e2.y += offsetY;
};

console.log('Initial Dist:', Math.sqrt((e1.x-e2.x)**2 + (e1.y-e2.y)**2));
// Target 50, Stiffness 1.0 (Rigid)
resolveDistance(e1, e2, 50, 1.0);
const newDist = Math.sqrt((e1.x-e2.x)**2 + (e1.y-e2.y)**2);
console.log('Resolved Dist (Target 50):', newDist);

if (Math.abs(newDist - 50) < 0.1) console.log('PASS: Constraint Resolved');
else console.log('FAIL: Constraint Failed');
