import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import {
  Mail, MessageSquare, QrCode, ArrowRight, Check,
  ChevronRight, Smartphone, Home, Zap, Shield, FileText, Bell, Eye
} from 'lucide-react';

const TOTAL_STEPS = 5;

// ─── Transition presets ───
const transition = { duration: 0.4, ease: [0.22, 1, 0.36, 1] };

const slideUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition },
  exit: { opacity: 0, y: -16, transition: { duration: 0.25 } }
};

const stagger = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { ...transition, delay } }
});

// ─── Main Wizard ───
export default function OnboardingWizard() {
  const [step, setStep] = useState(1);
  const next = useCallback(() => setStep(s => Math.min(s + 1, TOTAL_STEPS)), []);

  // Keyboard nav
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Enter' && step < TOTAL_STEPS) next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step, next]);

  return (
    <div className="onboarding-shell">
      {/* Top Bar */}
      <div className="top-bar">
        <div className="logo">
          <div className="logo-mark" />
          NexusTriage
        </div>
        <div className="step-counter">
          {step <= 4 ? `Step ${step} of 4` : 'Complete'}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="progress-track">
        <motion.div
          className="progress-fill"
          initial={{ width: '0%' }}
          animate={{ width: `${(Math.min(step, 4) / 4) * 100}%` }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        />
      </div>

      {/* Content */}
      <div className="content-area">
        <AnimatePresence mode="wait">
          {step === 1 && <WelcomeStep key="1" onNext={next} />}
          {step === 2 && <GmailStep key="2" onNext={next} />}
          {step === 3 && <TelegramStep key="3" onNext={next} />}
          {step === 4 && <WhatsAppStep key="4" onNext={next} />}
          {step === 5 && <DoneStep key="5" />}
        </AnimatePresence>
      </div>

      {/* Dock */}
      <Dock step={step} setStep={setStep} />
    </div>
  );
}

// ═══════════════════════════════════════════════
// STEP 1 — Welcome
// ═══════════════════════════════════════════════
function WelcomeStep({ onNext }) {
  return (
    <motion.div className="step-container" {...slideUp} style={{ textAlign: 'center' }}>
      <motion.h1 className="hero-title" {...stagger(0.1)}>
        NexusTriage
      </motion.h1>
      <motion.p className="hero-sub" style={{ margin: '0 auto 40px' }} {...stagger(0.2)}>
        Connect your channels. Let AI handle the rest.
      </motion.p>
      <motion.div {...stagger(0.3)}>
        <button className="btn-primary" onClick={onNext}>
          Get Started <ArrowRight size={15} strokeWidth={2.5} />
        </button>
        <div className="kbd-hint">
          Press <span className="kbd">↵</span> to continue
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════
// STEP 2 — Gmail
// ═══════════════════════════════════════════════
function GmailStep({ onNext }) {
  return (
    <motion.div className="step-container" {...slideUp}>
      <div
        className="service-badge"
        style={{ background: 'rgba(234,67,53,0.1)', color: '#ea4335' }}
      >
        <Mail size={26} strokeWidth={1.8} />
      </div>

      <h2 className="step-title">Connect Gmail</h2>
      <p className="step-desc">
        NexusTriage will monitor your inbox and draft AI-powered responses.
      </p>

      <motion.div className="perm-list" {...stagger(0.15)}>
        <PermItem icon={<Eye size={12} />} color="#ea4335" text="Read incoming emails" delay={0.2} />
        <PermItem icon={<FileText size={12} />} color="#ea4335" text="Draft AI responses" delay={0.3} />
        <PermItem icon={<Shield size={12} />} color="#ea4335" text="No emails sent without your approval" delay={0.4} />
      </motion.div>

      <motion.div {...stagger(0.45)}>
        <button
          className="btn-primary btn-brand"
          onClick={onNext}
          style={{ background: '#ea4335' }}
        >
          Authorize with Google <ChevronRight size={15} strokeWidth={2.5} />
        </button>
      </motion.div>
    </motion.div>
  );
}

function PermItem({ icon, color, text, delay }) {
  return (
    <motion.div className="perm-item" {...stagger(delay)}>
      <div className="perm-icon" style={{ background: `${color}18`, color }}>
        {icon}
      </div>
      {text}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════
// STEP 3 — Telegram
// ═══════════════════════════════════════════════
function TelegramStep({ onNext }) {
  return (
    <motion.div className="step-container" {...slideUp}>
      <div
        className="service-badge"
        style={{ background: 'rgba(42,171,238,0.1)', color: '#2aabee' }}
      >
        <MessageSquare size={26} strokeWidth={1.8} />
      </div>

      <h2 className="step-title">Telegram Bot</h2>
      <p className="step-desc">
        Where you'll receive triage alerts and summaries.
      </p>

      <div className="field">
        <label>Bot Token</label>
        <input type="text" placeholder="Paste from @BotFather" autoFocus />
      </div>

      <div className="field" style={{ marginBottom: 28 }}>
        <label>Chat ID</label>
        <input type="text" placeholder="e.g. 5188465720" />
      </div>

      <button
        className="btn-primary btn-brand"
        onClick={onNext}
        style={{ background: '#2aabee' }}
      >
        Connect Telegram <ChevronRight size={15} strokeWidth={2.5} />
      </button>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════
// STEP 4 — WhatsApp
// ═══════════════════════════════════════════════
function WhatsAppStep({ onNext }) {
  return (
    <motion.div className="step-container" {...slideUp}>
      <div
        className="service-badge"
        style={{ background: 'rgba(37,211,102,0.1)', color: '#25d366' }}
      >
        <Smartphone size={26} strokeWidth={1.8} />
      </div>

      <h2 className="step-title">Link WhatsApp</h2>
      <p className="step-desc">
        Scan this QR code with your phone to connect.
      </p>

      <div className="qr-container">
        <div className="qr-frame">
          <QrCode size={140} color="#000" strokeWidth={1} />
          <motion.div
            className="qr-scanner"
            animate={{ top: ['0%', '100%', '0%'], opacity: [0, 0.7, 0.7, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            style={{ background: '#25d366', boxShadow: '0 0 12px rgba(37,211,102,0.5)' }}
          />
        </div>
      </div>

      <button
        className="btn-primary btn-brand"
        onClick={onNext}
        style={{ background: '#25d366' }}
      >
        I've Scanned It <Check size={15} strokeWidth={2.5} />
      </button>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════
// STEP 5 — Done
// ═══════════════════════════════════════════════
function DoneStep() {
  return (
    <motion.div className="step-container" style={{ textAlign: 'center' }} {...slideUp}>
      {/* Animated SVG check */}
      <div className="done-check">
        <svg viewBox="0 0 80 80">
          <circle className="check-circle" cx="40" cy="40" r="38" />
          <polyline className="check-mark" points="25,42 35,52 55,30" />
        </svg>
      </div>

      <motion.h2 className="done-title" {...stagger(0.5)}>
        You're all set
      </motion.h2>
      <motion.p className="done-body" {...stagger(0.6)}>
        All channels connected successfully.<br />
        NexusTriage is now monitoring your inbox.
      </motion.p>
      <motion.p className="done-hint" {...stagger(0.7)}>
        You can safely close this tab.
      </motion.p>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════
// DOCK — macOS-style magnifying dock
// ═══════════════════════════════════════════════
const DOCK_ITEMS = [
  { icon: Home, label: 'Welcome', s: 1 },
  { icon: Mail, label: 'Gmail', s: 2 },
  { icon: MessageSquare, label: 'Telegram', s: 3 },
  { icon: Smartphone, label: 'WhatsApp', s: 4 },
  { icon: Zap, label: 'Done', s: 5 },
];

function Dock({ step, setStep }) {
  const mouseX = useMotionValue(Infinity);

  return (
    <motion.div
      className="dock-wrap"
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.6, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="dock-bar"
        onMouseMove={e => mouseX.set(e.pageX)}
        onMouseLeave={() => mouseX.set(Infinity)}
      >
        {DOCK_ITEMS.map(item => (
          <DockIcon
            key={item.s}
            mouseX={mouseX}
            active={step === item.s}
            completed={step > item.s}
            onClick={() => setStep(item.s)}
            label={item.label}
          >
            <item.icon size={16} strokeWidth={2} />
          </DockIcon>
        ))}
      </div>
    </motion.div>
  );
}

function DockIcon({ children, mouseX, active, completed, onClick, label }) {
  const ref = useRef(null);
  const [hovered, setHovered] = useState(false);

  const dist = useTransform(mouseX, val => {
    const r = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - r.x - r.width / 2;
  });

  const size = useSpring(
    useTransform(dist, [-100, 0, 100], [38, 52, 38]),
    { mass: 0.08, stiffness: 180, damping: 14 }
  );

  const cls = `dock-btn${active ? ' active' : ''}${completed && !active ? ' completed' : ''}`;

  return (
    <motion.button
      ref={ref}
      style={{ width: size, height: size }}
      className={cls}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {completed && !active ? <Check size={14} strokeWidth={2.5} /> : children}
      <AnimatePresence>
        {hovered && (
          <motion.span
            className="dock-tooltip"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 3 }}
            transition={{ duration: 0.12 }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
