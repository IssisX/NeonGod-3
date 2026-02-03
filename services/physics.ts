
import { Entity } from '../types';

export class PhysicsSystem {
    /**
     * Runge-Kutta 4th Order Integration (RK4)
     * Solves for position and velocity with high precision.
     * dx/dt = v
     * dv/dt = a = F/m
     *
     * @param e Entity to update
     * @param fx Force X (includes steering, separation, etc)
     * @param fy Force Y
     * @param dt Delta time (usually 1.0 for fixed step)
     * @param friction Damping factor (0.0 to 1.0)
     * @param mass Mass of the entity
     */
    static integrate(e: Entity, fx: number, fy: number, dt: number, friction: number, mass: number = 1.0) {
        // Acceleration function
        // a(v) = (F - friction * v) / m
        const accel = (vx: number, vy: number) => {
            // Drag force proportional to velocity squared? Or simple linear friction?
            // Linear friction for top-down games: F_drag = -k * v
            // Here we use the provided 'friction' as a drag coefficient roughly.
            // Let's assume F_net = F_applied - C_drag * v
            const drag = (1.0 - friction); // If friction is 0.95, drag is 0.05
            return {
                ax: (fx - vx * drag) / mass,
                ay: (fy - vy * drag) / mass
            };
        };

        const vx = e.vx;
        const vy = e.vy;

        // k1
        const a1 = accel(vx, vy);
        const k1_vx = a1.ax * dt;
        const k1_vy = a1.ay * dt;
        const k1_dx = vx * dt;
        const k1_dy = vy * dt;

        // k2
        const a2 = accel(vx + k1_vx * 0.5, vy + k1_vy * 0.5);
        const k2_vx = a2.ax * dt;
        const k2_vy = a2.ay * dt;
        const k2_dx = (vx + k1_vx * 0.5) * dt;
        const k2_dy = (vy + k1_vy * 0.5) * dt;

        // k3
        const a3 = accel(vx + k2_vx * 0.5, vy + k2_vy * 0.5);
        const k3_vx = a3.ax * dt;
        const k3_vy = a3.ay * dt;
        const k3_dx = (vx + k2_vx * 0.5) * dt;
        const k3_dy = (vy + k2_vy * 0.5) * dt;

        // k4
        const a4 = accel(vx + k3_vx, vy + k3_vy);
        const k4_vx = a4.ax * dt;
        const k4_vy = a4.ay * dt;
        const k4_dx = (vx + k3_vx) * dt;
        const k4_dy = (vy + k3_vy) * dt;

        // Update Position
        e.x += (k1_dx + 2*k2_dx + 2*k3_dx + k4_dx) / 6.0;
        e.y += (k1_dy + 2*k2_dy + 2*k3_dy + k4_dy) / 6.0;

        // Update Velocity
        e.vx += (k1_vx + 2*k2_vx + 2*k3_vx + k4_vx) / 6.0;
        e.vy += (k1_vy + 2*k2_vy + 2*k3_vy + k4_vy) / 6.0;
    }

    /**
     * Verlet Integration with Constraints
     * Best for particles and connected bodies.
     * pos = 2*pos - oldPos + a * dt*dt
     */
    static verlet(e: any, fx: number, fy: number, dt: number, drag: number) {
         // Requires prevX, prevY on entity.
         // If missing, initialize
         if (e.prevX === undefined) e.prevX = e.x - e.vx * dt;
         if (e.prevY === undefined) e.prevY = e.y - e.vy * dt;

         const tempX = e.x;
         const tempY = e.y;

         const ax = fx; // Mass assumed 1 or handled in force
         const ay = fy;

         // Verlet formula
         // x(t+1) = 2x(t) - x(t-1) + a*dt^2
         // With drag/damping: x(t+1) = x(t) + (x(t) - x(t-1)) * (1-drag) + a*dt^2

         e.x = e.x + (e.x - e.prevX) * (1.0 - drag) + ax * dt * dt;
         e.y = e.y + (e.y - e.prevY) * (1.0 - drag) + ay * dt * dt;

         e.prevX = tempX;
         e.prevY = tempY;

         // derive velocity for other systems
         e.vx = (e.x - e.prevX) / dt;
         e.vy = (e.y - e.prevY) / dt;
    }
}
