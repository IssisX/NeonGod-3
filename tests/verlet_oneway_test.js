
// tests/verlet_oneway_test.js
const e1 = { x: 100, y: 100 }; // Anchor
const e2 = { x: 200, y: 100 }; // Child

const resolveDistanceOneWay = (anchor, child, targetDist, stiffness = 1.0) => {
    const dx = anchor.x - child.x;
    const dy = anchor.y - child.y;
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq);

    if (dist === 0) return;

    const diff = (dist - targetDist) / dist;
    const correction = diff * stiffness;

    child.x += dx * correction;
    child.y += dy * correction;
};

console.log('Initial Anchor:', e1.x);
console.log('Initial Child:', e2.x);

// Resolve
resolveDistanceOneWay(e1, e2, 50, 1.0);

console.log('Final Anchor:', e1.x);
console.log('Final Child:', e2.x);

if (e1.x === 100 && Math.abs(e2.x - 150) < 0.1) console.log('PASS: Anchor Static, Child Moved');
else console.log('FAIL: Anchor Moved or Child Wrong');
