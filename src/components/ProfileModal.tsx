import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, User as UserIcon } from 'lucide-react';
import type { User } from '@/types';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (profile: Partial<User>) => void;
  walletAddress: string;
}

export function ProfileModal({ isOpen, onClose, onSave, walletAddress }: ProfileModalProps) {
  const [username, setUsername] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [photo, setPhoto] = useState<string>('');
  const [bio, setBio] = useState('');
  const [age, setAge] = useState('24');
  const [instagram, setInstagram] = useState('');
  const [xHandle, setXHandle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 3 * 1024 * 1024) {
        alert('Image too large. Please choose a file under 3MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxSize = 720;
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            setPhoto(reader.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          setPhoto(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => setPhoto(reader.result as string);
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    if (!username.trim() || !gender) return;

    onSave({
      username: username.startsWith('@') ? username : `@${username}`,
      gender,
      photo: photo || undefined,
      bio: bio || undefined,
      age: parseInt(age) || 24,
      instagram: instagram.trim() || undefined,
      xHandle: xHandle.trim() || undefined,
    });
  };

  const shortAddress = (addr: string) => {
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white w-full max-w-md rounded-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="p-6 overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Complete Your SUGAR Profile
                  </div>
                  <h3 className="font-serif text-2xl text-slate-800 mt-1">Sign in with your wallet</h3>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <p className="text-sm text-slate-500 mb-6">
                Choose a username and gender. Add socials if you want your match to find you.
              </p>

              {/* Wallet Display */}
              <div className="mb-4 p-3 bg-slate-50 rounded-xl">
                <div className="text-xs text-slate-400 uppercase tracking-wide">Connected Wallet</div>
                <div className="text-sm font-mono text-slate-700 mt-1">{shortAddress(walletAddress)}</div>
              </div>

              {/* Username */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Username (public)
                </label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="mt-1.5 w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
                  placeholder="@name"
                />
              </div>

              {/* Age */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Age
                </label>
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="mt-1.5 w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
                  placeholder="24"
                />
              </div>

              {/* Bio */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Bio
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={2}
                  className="mt-1.5 w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200 resize-none"
                  placeholder="Tell us about yourself..."
                />
              </div>

              {/* Socials */}
              <div className="mb-4 grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Instagram
                  </label>
                  <input
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    className="mt-1.5 w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
                    placeholder="yourhandle"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    X (Twitter)
                  </label>
                  <input
                    value={xHandle}
                    onChange={(e) => setXHandle(e.target.value)}
                    className="mt-1.5 w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
                    placeholder="yourhandle"
                  />
                </div>
              </div>

              {/* Gender */}
              <div className="mb-4">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
                  Gender
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setGender('female')}
                    className={`flex-1 px-4 py-3 rounded-xl border text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                      gender === 'female'
                        ? 'bg-pink-500 text-white border-pink-500'
                        : 'border-slate-100 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <UserIcon className="w-4 h-4" />
                    Female
                  </button>
                  <button
                    onClick={() => setGender('male')}
                    className={`flex-1 px-4 py-3 rounded-xl border text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                      gender === 'male'
                        ? 'bg-indigo-500 text-white border-indigo-500'
                        : 'border-slate-100 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <UserIcon className="w-4 h-4" />
                    Male
                  </button>
                </div>
              </div>

              {/* Photo Upload */}
              <div className="mb-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">
                  Upload Photo (optional)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full py-4 rounded-xl border-2 border-dashed transition-all flex flex-col items-center gap-2 ${
                    photo
                      ? 'border-pink-500 bg-pink-50'
                      : 'border-slate-200 hover:border-pink-300 hover:bg-slate-50'
                  }`}
                >
                  {photo ? (
                    <img src={photo} alt="Preview" className="w-16 h-16 rounded-full object-cover" />
                  ) : (
                    <>
                      <Camera className="w-6 h-6 text-slate-400" />
                      <span className="text-sm text-slate-500">Click to upload photo</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 pb-6 pt-4 border-t border-slate-100">
              <div className="text-xs text-slate-400">Complete your profile to start matching.</div>
              <button
                onClick={handleSave}
                disabled={!username.trim() || !gender}
                className="px-6 py-2.5 rounded-full bg-pink-500 text-white text-sm font-semibold shadow-lg shadow-pink-500/30 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-pink-600 transition-colors"
              >
                Save Profile
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
