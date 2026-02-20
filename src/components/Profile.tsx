import { useState, useRef } from 'react';
import { Camera, Edit2, Save, Wallet, Heart, TrendingUp, Image as ImageIcon } from 'lucide-react';
import type { User, Portfolio } from '@/types';

interface ProfileProps {
  profile: User | null;
  session: { address: string };
  portfolio: Portfolio | null;
  heartsSent: number;
  heartsReceived: number;
  onUpdateProfile: (updates: Partial<User>) => void;
}

export function ProfilePage({
  profile,
  session,
  portfolio,
  heartsSent,
  heartsReceived,
  onUpdateProfile,
}: ProfileProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState<Partial<User>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleEdit = () => {
    setEditedProfile({
      username: profile?.username,
      bio: profile?.bio,
      age: profile?.age,
      instagram: profile?.instagram,
      xHandle: profile?.xHandle,
      photo: profile?.photo,
      gender: profile?.gender,
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    onUpdateProfile(editedProfile);
    setIsEditing(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setEditedProfile((prev) => ({ ...prev, photo: event.target?.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const shortAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
  };

  const formatNumber = (num: number) => {
    if (num > 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num > 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toFixed(2);
  };

  const displayProfile = isEditing ? editedProfile : profile;
  const initials = (displayProfile?.username || 'SG').replace('@', '').slice(0, 2).toUpperCase();

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="relative">
                <div
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-2xl text-white font-bold overflow-hidden"
                  style={
                    displayProfile?.photo
                      ? { backgroundImage: `url(${displayProfile.photo})`, backgroundSize: 'cover' }
                      : {}
                  }
                >
                  {!displayProfile?.photo && initials}
                </div>
                {isEditing && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-pink-500 text-white flex items-center justify-center shadow-lg"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Info */}
              <div>
                {isEditing ? (
                  <input
                    value={editedProfile.username || ''}
                    onChange={(e) =>
                      setEditedProfile((prev) => ({ ...prev, username: e.target.value }))
                    }
                    className="text-xl font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1"
                    placeholder="@username"
                  />
                ) : (
                  <h2 className="text-xl font-bold text-slate-800">
                    {displayProfile?.username || 'Guest User'}
                  </h2>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <Wallet className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-500 font-mono">
                    {shortAddress(session.address)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setEditedProfile((prev) => ({ ...prev, gender: 'female' }))
                        }
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          (editedProfile.gender || displayProfile?.gender) === 'female'
                            ? 'bg-pink-500 text-white border-pink-500'
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Female
                      </button>
                      <button
                        onClick={() =>
                          setEditedProfile((prev) => ({ ...prev, gender: 'male' }))
                        }
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          (editedProfile.gender || displayProfile?.gender) === 'male'
                            ? 'bg-indigo-500 text-white border-indigo-500'
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Male
                      </button>
                    </div>
                  ) : displayProfile?.gender ? (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        displayProfile?.gender === 'female'
                          ? 'bg-pink-100 text-pink-600'
                          : 'bg-indigo-100 text-indigo-600'
                      }`}
                    >
                      {displayProfile.gender === 'female' ? 'Female' : 'Male'}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
                      Not set
                    </span>
                  )}
                  {isEditing ? (
                    <input
                      type="number"
                      value={editedProfile.age || ''}
                      onChange={(e) =>
                        setEditedProfile((prev) => ({ ...prev, age: parseInt(e.target.value) || 24 }))
                      }
                      className="w-16 text-sm bg-slate-50 border border-slate-200 rounded px-2 py-0.5"
                    />
                  ) : (
                    <span className="text-sm text-slate-500">
                      {displayProfile?.age ? `${displayProfile.age} years old` : 'Age not set'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Edit Button */}
            <button
              onClick={isEditing ? handleSave : handleEdit}
              className={`px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 transition-colors ${
                isEditing
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {isEditing ? <Save className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
              {isEditing ? 'Save' : 'Edit'}
            </button>
          </div>

          {/* Bio */}
          <div className="mt-4">
            {isEditing ? (
              <textarea
                value={editedProfile.bio || ''}
                onChange={(e) =>
                  setEditedProfile((prev) => ({ ...prev, bio: e.target.value }))
                }
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm resize-none"
                placeholder="Tell us about yourself..."
              />
            ) : (
              <p className="text-slate-600">
                {displayProfile?.bio || 'No bio yet. Click edit to add one!'}
              </p>
            )}
          </div>

          {/* Socials */}
          <div className="mt-4 grid grid-cols-1 gap-3">
            {isEditing ? (
              <>
                <input
                  value={editedProfile.instagram || ''}
                  onChange={(e) =>
                    setEditedProfile((prev) => ({ ...prev, instagram: e.target.value }))
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm"
                  placeholder="Instagram handle"
                />
                <input
                  value={editedProfile.xHandle || ''}
                  onChange={(e) =>
                    setEditedProfile((prev) => ({ ...prev, xHandle: e.target.value }))
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm"
                  placeholder="X (Twitter) handle"
                />
              </>
            ) : (
              <div className="text-sm text-slate-500">
                {displayProfile?.instagram && (
                  <div>Instagram: {displayProfile.instagram}</div>
                )}
                {displayProfile?.xHandle && (
                  <div className="inline-flex items-center gap-2">
                    <svg
                      viewBox="0 0 24 24"
                      className="w-4 h-4 text-slate-700"
                      aria-hidden="true"
                    >
                      <path
                        fill="currentColor"
                        d="M18.244 2H21.86l-7.9 9.03L23.5 22h-7.2l-5.64-6.83L4.4 22H.78l8.45-9.66L0 2h7.33l5.1 6.18L18.244 2Zm-1.26 18h2.02L7.2 4H5.03l11.954 16Z"
                      />
                    </svg>
                    <span>{displayProfile.xHandle}</span>
                  </div>
                )}
                {!displayProfile?.instagram && !displayProfile?.xHandle && (
                  <div>No social links yet.</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-pink-100 flex items-center justify-center">
              <Heart className="w-5 h-5 text-pink-500" />
            </div>
            <div className="text-2xl font-bold text-slate-800">{heartsSent}</div>
            <div className="text-xs text-slate-400 uppercase tracking-wide">Hearts Sent</div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-rose-100 flex items-center justify-center">
              <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
            </div>
            <div className="text-2xl font-bold text-slate-800">{heartsReceived}</div>
            <div className="text-xs text-slate-400 uppercase tracking-wide">Hearts Received</div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-indigo-100 flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="text-2xl font-bold text-slate-800">
              {portfolio?.nfts?.length || 0}
            </div>
            <div className="text-xs text-slate-400 uppercase tracking-wide">NFTs</div>
          </div>
        </div>

        {/* Portfolio */}
        {portfolio && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
              <h3 className="font-semibold text-slate-800">Your Portfolio</h3>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="text-xs text-slate-400 uppercase tracking-wide">SOL Balance</div>
                <div className="text-xl font-bold text-slate-800 mt-1">
                  {portfolio.balance.toFixed(2)} SOL
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="text-xs text-slate-400 uppercase tracking-wide">Total Value</div>
                <div className="text-xl font-bold text-slate-800 mt-1">
                  ${formatNumber(portfolio.total_value)}
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wide mb-3">Tokens</div>
              <div className="space-y-2">
                {portfolio.tokens.slice(0, 5).map((token) => (
                  <div
                    key={token.symbol}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-xs text-white font-bold">
                        {token.symbol.slice(0, 2)}
                      </div>
                      <span className="font-semibold text-slate-700">{token.symbol}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-slate-800">{formatNumber(token.amount)}</div>
                      <div className="text-xs text-slate-400">${formatNumber(token.usdValue)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
