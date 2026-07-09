import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, MessageSquare, QrCode, ArrowRight, CheckCircle2, ChevronRight, Smartphone } from 'lucide-react';

// Animation Variants
const pageVariants = {
  initial: { opacity: 0, x: 20, scale: 0.98 },
  in: { opacity: 1, x: 0, scale: 1 },
  out: { opacity: 0, x: -20, scale: 0.98 }
};

const pageTransition = {
  type: 'spring',
  stiffness: 300,
  damping: 30
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

export default function OnboardingWizard() {
  const [step, setStep] = useState(1);

  const nextStep = () => setStep((s) => Math.min(s + 1, 4));

  return (
    <div className="glass-panel">
      <AnimatePresence mode="wait">
        {step === 1 && <WelcomeStep key="step1" onNext={nextStep} />}
        {step === 2 && <GmailStep key="step2" onNext={nextStep} />}
        {step === 3 && <TelegramStep key="step3" onNext={nextStep} />}
        {step === 4 && <WhatsAppStep key="step4" onNext={nextStep} />}
      </AnimatePresence>
      
      {/* Progress Indicator */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '30px' }}>
        {[1, 2, 3, 4].map(i => (
          <motion.div
            key={i}
            initial={false}
            animate={{
              width: i === step ? 24 : 8,
              backgroundColor: i === step ? '#8b5cf6' : 'rgba(255,255,255,0.2)'
            }}
            style={{ height: 8, borderRadius: 4 }}
          />
        ))}
      </div>
    </div>
  );
}

function WelcomeStep({ onNext }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial" animate="in" exit="out" transition={pageTransition}
      style={{ textAlign: 'center' }}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, type: 'spring' }}
        style={{ width: 80, height: 80, background: 'rgba(139, 92, 246, 0.1)', borderRadius: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', border: '1px solid rgba(139, 92, 246, 0.3)' }}
      >
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', boxShadow: '0 0 20px rgba(139, 92, 246, 0.5)' }} />
      </motion.div>
      
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        Welcome to NexusTriage
      </motion.h1>
      <motion.p className="subtitle" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        Your personal AI triage platform. Let's get your communication channels connected in just a few clicks.
      </motion.p>
      
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <button className="primary-btn" onClick={onNext}>
          Get Started <ArrowRight size={18} />
        </button>
      </motion.div>
    </motion.div>
  );
}

function GmailStep({ onNext }) {
  return (
    <motion.div variants={pageVariants} initial="initial" animate="in" exit="out" transition={pageTransition}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{ padding: 12, background: 'rgba(239, 68, 68, 0.1)', borderRadius: 12, color: '#ef4444' }}>
          <Mail size={28} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Connect Gmail</h2>
          <p style={{ color: '#a1a1aa', fontSize: '0.9rem' }}>Allow NexusTriage to analyze your inbox.</p>
        </div>
      </div>
      
      <motion.div variants={containerVariants} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
        <motion.div variants={itemVariants} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
          <CheckCircle2 size={18} color="#10b981" />
          <span style={{ fontSize: '0.9rem', color: '#e4e4e7' }}>Read incoming emails</span>
        </motion.div>
        <motion.div variants={itemVariants} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
          <CheckCircle2 size={18} color="#10b981" />
          <span style={{ fontSize: '0.9rem', color: '#e4e4e7' }}>Draft AI responses</span>
        </motion.div>
      </motion.div>
      
      <button className="primary-btn" onClick={onNext} style={{ background: '#ef4444' }}>
        Authorize with Google <ChevronRight size={18} />
      </button>
    </motion.div>
  );
}

function TelegramStep({ onNext }) {
  return (
    <motion.div variants={pageVariants} initial="initial" animate="in" exit="out" transition={pageTransition}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{ padding: 12, background: 'rgba(56, 189, 248, 0.1)', borderRadius: 12, color: '#38bdf8' }}>
          <MessageSquare size={28} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Telegram Bot</h2>
          <p style={{ color: '#a1a1aa', fontSize: '0.9rem' }}>Where you'll receive triage alerts.</p>
        </div>
      </div>
      
      <div className="input-group">
        <label>Bot Token (from @BotFather)</label>
        <input type="text" placeholder="123456789:ABCdefGHIjklMNOpqr..." />
      </div>
      
      <div className="input-group" style={{ marginBottom: 32 }}>
        <label>Your Chat ID</label>
        <input type="text" placeholder="e.g. 5188465720" />
      </div>
      
      <button className="primary-btn" onClick={onNext} style={{ background: '#0284c7' }}>
        Connect Telegram <ChevronRight size={18} />
      </button>
    </motion.div>
  );
}

function WhatsAppStep({ onNext }) {
  const [scanning, setScanning] = useState(true);

  return (
    <motion.div variants={pageVariants} initial="initial" animate="in" exit="out" transition={pageTransition}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{ padding: 12, background: 'rgba(34, 197, 94, 0.1)', borderRadius: 12, color: '#22c55e' }}>
          <Smartphone size={28} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Link WhatsApp</h2>
          <p style={{ color: '#a1a1aa', fontSize: '0.9rem' }}>Scan this QR code to connect.</p>
        </div>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'center', margin: '32px 0' }}>
        <div style={{ position: 'relative', padding: 16, background: 'white', borderRadius: 16 }}>
          <QrCode size={180} color="#000" strokeWidth={1} />
          
          {/* Animated Scanning Laser */}
          {scanning && (
            <motion.div
              initial={{ top: 0, opacity: 0 }}
              animate={{ top: ['0%', '100%', '0%'], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              style={{
                position: 'absolute',
                left: 0,
                width: '100%',
                height: 2,
                background: '#22c55e',
                boxShadow: '0 0 10px #22c55e, 0 0 20px #22c55e'
              }}
            />
          )}
        </div>
      </div>
      
      <button className="primary-btn" onClick={() => setScanning(!scanning)} style={{ background: '#16a34a' }}>
        Finish Setup <CheckCircle2 size={18} />
      </button>
    </motion.div>
  );
}
