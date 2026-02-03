
import { GameState, Enemy, Player, BossModule, Bullet } from '../types';
import { CONFIG } from '../constants';
import { Utils } from '../utils';

// --- VISUAL HELPERS ---

function drawTechDetail(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - size, y - size); ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size); ctx.lineTo(x - size, y + size);
    ctx.stroke();
}

function drawEnginePlume(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, power: number, color: string) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalCompositeOperation = 'lighter';
    
    // Inner Core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    const coreLen = 10 + power * 20 + Math.random() * 5;
    ctx.moveTo(0, 0); ctx.lineTo(-coreLen, -2); ctx.lineTo(-coreLen * 1.2, 0); ctx.lineTo(-coreLen, 2);
    ctx.closePath(); ctx.fill();
    
    // Outer Plasma
    ctx.fillStyle = color;
    ctx.beginPath();
    const outerLen = 20 + power * 40 + Math.random() * 10;
    ctx.moveTo(0, 0); ctx.lineTo(-outerLen, -5); ctx.lineTo(-outerLen * 1.3, 0); ctx.lineTo(-outerLen, 5);
    ctx.closePath(); ctx.fill();
    
    // Shock Diamonds
    if (power > 0.5) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        for(let i=1; i<=3; i++) {
            const d = i * 15;
            ctx.beginPath(); ctx.ellipse(-d - Math.random()*2, 0, 3, 5, 0, 0, Math.PI*2); ctx.fill();
        }
    }
    ctx.restore();
}

// Draw a trail that fades out over its length
function drawDissipatingTrail(ctx: CanvasRenderingContext2D, trail: {x: number, y: number}[], color: string, width: number) {
    if (trail.length < 2) return;
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // To make it dissipate, we can't draw a single stroke. 
    // We draw segments with decreasing opacity.
    for (let i = 0; i < trail.length - 1; i++) {
        const p1 = trail[i];
        const p2 = trail[i+1];
        
        // Alpha calculation: older points (lower index) are more transparent
        // Actually, usually trail[0] is the oldest. 
        const alpha = (i / trail.length); 
        
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha * 0.6; // Max opacity 0.6
        ctx.lineWidth = width * (0.5 + alpha * 0.5); // Taper width slightly
        
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
}

// Draw heat distortion to the distortion canvas
// Channel: 'r' for Heat (Noise displacement), 'g' for Gravity (Swirl/Pull)
function drawDistortion(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, intensity: number, type: 'heat' | 'gravity') {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    
    const rVal = type === 'heat' ? Math.floor(intensity * 255) : 0;
    const gVal = type === 'gravity' ? Math.floor(intensity * 255) : 0;
    
    grad.addColorStop(0, `rgba(${rVal}, ${gVal}, 0, 1.0)`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
}

// --- BOSS RENDERER ---

function drawBossModule(ctx: CanvasRenderingContext2D, mod: BossModule, hitFlash: number) {
    ctx.save();
    ctx.translate(mod.xOffset, mod.yOffset);
    ctx.rotate(mod.rotation);

    const pulse = 1.0 + Math.sin(Date.now() * 0.005) * 0.02;
    ctx.scale(pulse, pulse);

    ctx.shadowColor = mod.color;
    ctx.shadowBlur = hitFlash > 0 ? 30 : 10;

    ctx.beginPath();
    if (mod.shape.length >= 2) {
        ctx.moveTo(mod.shape[0], mod.shape[1]);
        for(let k=2; k<mod.shape.length; k+=2) {
            ctx.lineTo(mod.shape[k], mod.shape[k+1]);
        }
    }
    ctx.closePath();

    if (hitFlash > 0) {
        ctx.fillStyle = '#ffffff';
    } else {
        const grad = ctx.createLinearGradient(-20, -20, 20, 20);
        grad.addColorStop(0, mod.color);
        grad.addColorStop(0.6, '#111');
        grad.addColorStop(1, mod.color);
        ctx.fillStyle = grad;
    }
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Reactor Glow
    if (mod.type === 'CORE' || mod.type === 'ENGINE') {
        const reactorPulse = Math.sin(Date.now() * 0.01) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255, 255, 255, ${reactorPulse})`;
        ctx.beginPath(); ctx.arc(0,0, mod.size * 0.2, 0, Math.PI*2); ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.restore();
}

function drawMechanicalLimb(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
    ctx.save();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo((x1+x2)/2, (y1+y2)/2); ctx.stroke();
    
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(x1, y1, 5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x2, y2, 5, 0, Math.PI*2); ctx.fill();
    ctx.restore();
}

function drawInterceptor(ctx: CanvasRenderingContext2D, p: Player, s: GameState) {
    const power = Math.hypot(p.vx, p.vy) / 5;
    drawEnginePlume(ctx, -12, -6, Math.PI, power, '#00ffff');
    drawEnginePlume(ctx, -12, 6, Math.PI, power, '#00ffff');
    const color = p.hitFlash > 0 ? '#ffffff' : CONFIG.COLORS.PLAYER;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-10, -10); ctx.lineTo(-5, 0); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#005577'; ctx.beginPath(); ctx.moveTo(-5, -5); ctx.lineTo(-15, -15); ctx.lineTo(-5, -10); ctx.moveTo(-5, 5); ctx.lineTo(-15, 15); ctx.lineTo(-5, 10); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(0, -3); ctx.lineTo(0, 3); ctx.fill();
}

function drawBastion(ctx: CanvasRenderingContext2D, p: Player, s: GameState) {
    const power = Math.hypot(p.vx, p.vy) / 5;
    drawEnginePlume(ctx, -15, 0, Math.PI, power * 1.5, '#ff5500');
    const color = p.hitFlash > 0 ? '#ffffff' : '#ff5500';
    ctx.fillStyle = color; ctx.fillRect(-15, -10, 25, 20);
    ctx.fillStyle = '#552200'; ctx.fillRect(-12, -12, 10, 4); ctx.fillRect(-12, 8, 10, 4);
}

function drawArchitect(ctx: CanvasRenderingContext2D, p: Player, s: GameState) {
    const power = Math.hypot(p.vx, p.vy) / 5;
    drawEnginePlume(ctx, -8, -8, Math.PI + 0.2, power, '#00ffaa');
    drawEnginePlume(ctx, -8, 8, Math.PI - 0.2, power, '#00ffaa');
    const color = p.hitFlash > 0 ? '#ffffff' : '#00ffaa';
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#00ffaa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 12 + Math.sin(s.frame*0.1)*2, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, -10); ctx.lineTo(20, -15); ctx.moveTo(10, 10); ctx.lineTo(20, 15); ctx.stroke();
}

// --- MAIN RENDERER ---

export function renderGame(ctx: CanvasRenderingContext2D, distCtx: CanvasRenderingContext2D, s: GameState) {
    const w = ctx.canvas.width / s.pixelRatio;
    const h = ctx.canvas.height / s.pixelRatio;

    // 1. Clear Canvases & Background
    if (s.player.skills.q.active) ctx.fillStyle = '#000000'; 
    else ctx.fillStyle = CONFIG.COLORS.BACKGROUND;
    ctx.fillRect(0, 0, w, h);
    
    distCtx.fillStyle = '#000000'; 
    distCtx.fillRect(0, 0, w, h);

    // Camera Setup
    ctx.save(); distCtx.save();
    
    // Apply Shake + Kick
    const shakeX = (Math.random() - 0.5) * s.shake + s.camera.kickX; 
    const shakeY = (Math.random() - 0.5) * s.shake + s.camera.kickY;
    
    const camX = s.camera.x + shakeX; 
    const camY = s.camera.y + shakeY;
    
    ctx.translate(w/2, h/2); ctx.scale(s.camera.zoom, s.camera.zoom); ctx.translate(-camX, -camY);
    distCtx.translate(w/2, h/2); distCtx.scale(s.camera.zoom, s.camera.zoom); distCtx.translate(-camX, -camY);

    // 2. Render Visual Grid
    if (s.visualGrid) s.visualGrid.render(ctx, s.quality === 'LOW' ? 2 : 1);

    // 3. Render Stars
    for(const star of s.stars) {
        ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness * (s.player.skills.q.active ? 0.2 : 1.0)})`;
        ctx.beginPath(); ctx.arc(star.x, star.y, star.size * star.z, 0, Math.PI * 2); ctx.fill();
    }
    
    // 4. Render Arena Boundary
    if (s.arena.active || s.arena.alpha > 0) {
        ctx.save();
        ctx.globalAlpha = s.arena.alpha;
        ctx.strokeStyle = '#ff0055';
        ctx.lineWidth = 4;
        ctx.setLineDash([20, 10]);
        ctx.beginPath();
        ctx.arc(s.arena.x, s.arena.y, s.arena.radius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Inner Glow
        ctx.fillStyle = 'rgba(255, 0, 85, 0.05)';
        ctx.fill();
        
        // Boundary Distortion
        drawDistortion(distCtx, s.arena.x, s.arena.y, s.arena.radius + 20, 0.5, 'heat');
        ctx.restore();
    }

    // 5. Black Holes
    for(const bh of s.blackHoles) {
        if(bh.active) {
            ctx.fillStyle = '#000'; 
            ctx.shadowBlur = 30; ctx.shadowColor = bh.color;
            ctx.beginPath(); ctx.arc(bh.x, bh.y, bh.radius, 0, Math.PI * 2); ctx.fill(); 
            ctx.shadowBlur = 0;
            ctx.strokeStyle = bh.color; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(bh.x, bh.y, bh.radius * 1.5 + Math.sin(s.frame * 0.5) * 5, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#fff';
            for(let i=0; i<8; i++) {
                const ang = s.frame * 0.1 + (i * Math.PI / 4);
                const dist = bh.radius * 2;
                ctx.beginPath(); ctx.arc(bh.x + Math.cos(ang)*dist, bh.y + Math.sin(ang)*dist, 2, 0, Math.PI*2); ctx.fill();
            }
            drawDistortion(distCtx, bh.x, bh.y, bh.pullRange, 2.0, 'gravity');
        }
    }

    // 6. Entities & Debris
    for(const d of s.debris) {
        if (!d.active) continue;
        ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rotation);
        
        // Hit Flash
        if (d.flash > 0) {
             ctx.globalCompositeOperation = 'lighter';
             ctx.fillStyle = '#ffffff';
        } else {
            ctx.fillStyle = d.type === 'asteroid' ? '#444455' : d.color;
        }

        if (d.type === 'asteroid') {
            ctx.shadowColor = '#000'; ctx.shadowBlur = 10;
            ctx.beginPath();
            const step = (Math.PI * 2) / d.sides;
            for(let i=0; i<d.sides; i++) {
                const r = d.size * (0.8 + Math.sin(i * 123.1) * 0.2); 
                ctx.lineTo(Math.cos(step*i)*r, Math.sin(step*i)*r);
            }
            ctx.closePath(); ctx.fill();
            
            ctx.strokeStyle = '#222233'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-d.size/2, 0); ctx.lineTo(0, d.size/4); ctx.lineTo(d.size/3, -d.size/4); ctx.stroke();
        } else {
            // Scrap / Shards
            ctx.beginPath();
            const step = (Math.PI * 2) / d.sides;
            for(let i=0; i<d.sides; i++) ctx.lineTo(Math.cos(step*i)*d.size, Math.sin(step*i)*d.size);
            ctx.closePath(); ctx.fill();
            
            // Detail for tech scrap
            ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
            ctx.stroke();
        }
        ctx.restore();
    }

    // 7. Enemies
    for(const e of s.enemies) {
        if (!e.active || e.dead) continue;
        ctx.save(); ctx.translate(e.x, e.y);
        
        if (e.trail && e.trail.length > 1) {
            ctx.restore(); 
            drawDissipatingTrail(ctx, e.trail, e.color, e.size * 0.5);
            ctx.save(); 
            ctx.translate(e.x, e.y);
        }

        if (e.modules) {
            // BOSS
            const rot = s.frame * 0.005; 
            ctx.rotate(rot);
            for(const mod of e.modules) drawMechanicalLimb(ctx, 0, 0, mod.xOffset, mod.yOffset);
            for(const mod of e.modules) drawBossModule(ctx, mod, e.hitFlash);
            ctx.fillStyle = e.hitFlash > 0 ? '#fff' : '#000';
            ctx.beginPath(); ctx.arc(0,0, 15, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.stroke();
        } else {
            // STANDARD
            let rot = Math.atan2(e.vy, e.vx);
            if (e.type === 'snake_head') rot = e.rotation;
            if (e.type === 'orbiter') rot = s.frame * 0.05;
            ctx.rotate(rot);
            
            const color = e.hitFlash > 0 ? '#ffffff' : e.color;
            ctx.fillStyle = color;
            ctx.beginPath();
            if (e.sides === 0) {
                ctx.arc(0, 0, e.size, 0, Math.PI * 2);
            } else {
                const step = (Math.PI * 2) / e.sides;
                const off = e.type === 'tank' ? Math.PI/e.sides : 0;
                ctx.moveTo(e.size, 0);
                for(let i=1; i<=e.sides; i++) ctx.lineTo(Math.cos(step*i + off) * e.size, Math.sin(step*i + off) * e.size);
            }
            ctx.closePath(); ctx.fill();
            
            ctx.shadowColor = e.color; ctx.shadowBlur = 10;
            ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.stroke();
            ctx.shadowBlur = 0;
        }
        
        if (e.invulnerable) {
            ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, e.size + 8, 0, Math.PI*2); ctx.stroke();
        }
        
        ctx.restore();
    }

    // 8. Player
    const p = s.player;
    if (p.active) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
        const bank = p.roll || 0;
        const bankScale = Math.max(0.6, 1.0 - Math.abs(bank * 0.4));
        ctx.transform(1, 0, -bank * 0.2, bankScale, 0, 0);

        if (p.dashCd > (p.maxDashCd - CONFIG.PLAYER.DASH.INVULN_DURATION)) {
            ctx.globalAlpha = 0.5; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(-20, -20, 40, 40);
        }

        if (p.hull === 'INTERCEPTOR') drawInterceptor(ctx, p, s);
        else if (p.hull === 'BASTION') drawBastion(ctx, p, s);
        else if (p.hull === 'ARCHITECT') drawArchitect(ctx, p, s);
        else drawInterceptor(ctx, p, s);

        if (s.orbitals.length > 0) {
            ctx.scale(1.0, 1.0/bankScale);
            for(const o of s.orbitals) {
                 o.angle += 0.05;
                 const ox = Math.cos(o.angle) * o.dist; const oy = Math.sin(o.angle) * o.dist;
                 ctx.fillStyle = '#00ffff'; ctx.beginPath(); ctx.arc(ox, oy, 6, 0, Math.PI * 2); ctx.fill();
                 ctx.strokeStyle = 'rgba(0,255,255,0.2)'; ctx.beginPath(); ctx.arc(0,0, o.dist, o.angle - 0.5, o.angle); ctx.stroke();
            }
        }
        ctx.restore();
        
        drawDistortion(distCtx, p.x + Math.cos(p.angle)*-20, p.y + Math.sin(p.angle)*-20, 30, 0.5, 'heat');
        
        if (p.muzzleFlash > 0) {
            const hx = p.x + Math.cos(p.angle)*30; const hy = p.y + Math.sin(p.angle)*30;
            drawDistortion(distCtx, hx, hy, 50, 0.8, 'heat');
            ctx.fillStyle = '#ffffaa';
            ctx.beginPath(); ctx.arc(hx, hy, 15, 0, Math.PI*2); ctx.fill();
        }
    }

    // 9. Bullets
    for(const b of s.bullets) {
        if (!b.active) continue;
        drawDistortion(distCtx, b.x, b.y, b.size * 4, 0.3, 'heat');

        if (b.isBeam) {
             ctx.strokeStyle = b.color; ctx.lineWidth = b.size; ctx.shadowBlur = 10; ctx.shadowColor = b.color;
             ctx.beginPath();
             if(b.beamPoints) for(let i=0; i<b.beamPoints.length; i++) { const pt = b.beamPoints[i]; if(i===0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y); }
             ctx.stroke(); ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.shadowBlur = 0;
        } else {
             if (b.trail) drawDissipatingTrail(ctx, b.trail, b.color, b.size * 0.8);
             ctx.save(); 
             ctx.globalCompositeOperation = 'lighter'; 
             ctx.fillStyle = b.color; 
             ctx.shadowColor = b.color; ctx.shadowBlur = 10;
             ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2); ctx.fill();
             ctx.fillStyle = '#fff'; 
             ctx.beginPath(); ctx.arc(b.x, b.y, b.size * 0.6, 0, Math.PI * 2); ctx.fill();
             ctx.restore();
        }
    }

    // 10. Explosions & Shockwaves
    for(const sw of s.shockwaves) {
        ctx.save(); 
        ctx.globalCompositeOperation = 'lighter'; 
        ctx.strokeStyle = sw.color; 
        ctx.lineWidth = sw.width; 
        ctx.globalAlpha = sw.alpha;
        ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.size, 0, Math.PI * 2); ctx.stroke(); 
        ctx.restore();
        drawDistortion(distCtx, sw.x, sw.y, sw.size, sw.alpha, 'heat');
    }

    // 11. Particles (SoA)
    const ps = s.particleSystem;
    if (ps && ps.count > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for(let i=0; i<ps.count; i++) {
            ctx.fillStyle = ps.color[i];
            ctx.globalAlpha = Math.max(0, ps.life[i] / ps.maxLife[i]);
            const sz = ps.size[i];
            const hsz = sz * 0.5;

            if (ps.type[i] === 0) { // Spark
                ctx.beginPath();
                ctx.arc(ps.x[i], ps.y[i], sz, 0, Math.PI*2);
                ctx.fill();
            } else {
                ctx.fillRect(ps.x[i] - hsz, ps.y[i] - hsz, sz, sz);
            }
        }
        ctx.restore();
    }

    // 12. UI Elements
    for(const g of s.gems) {
        if(!g.active) continue;
        ctx.fillStyle = CONFIG.COLORS.XP_GEM; ctx.shadowColor = CONFIG.COLORS.XP_GEM; ctx.shadowBlur = 5;
        ctx.beginPath(); ctx.moveTo(g.x, g.y - 4); ctx.lineTo(g.x + 4, g.y); ctx.lineTo(g.x, g.y + 4); ctx.lineTo(g.x - 4, g.y); ctx.fill(); ctx.shadowBlur = 0;
    }
    for(const p of s.pickups) {
        if(!p.active) continue;
        ctx.fillStyle = CONFIG.PICKUPS.COLOR; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x - 3, p.y); ctx.lineTo(p.x + 3, p.y); ctx.moveTo(p.x, p.y - 3); ctx.lineTo(p.x, p.y + 3); ctx.stroke();
    }
    for(const t of s.texts) { 
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.globalAlpha = t.opacity;
        ctx.font = `bold ${t.size}px monospace`; 
        ctx.textAlign = 'center'; 
        ctx.fillStyle = t.color;
        
        if (t.isCrit) {
            ctx.shadowColor = t.color;
            ctx.shadowBlur = 10;
            ctx.scale(1.2, 1.2);
        }
        
        ctx.fillText(t.text, 0, 0); 
        ctx.restore();
    }

    ctx.restore(); distCtx.restore();
    
    // Screen flash handled by HTML overlay or separate pass? 
    // Usually fine here if it's simple color fill.
    if (s.screenFlash > 0) {
        ctx.fillStyle = s.flashColor; ctx.globalAlpha = s.screenFlash * 0.3; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1.0;
    }
}
