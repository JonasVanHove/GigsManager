"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "./AuthProvider";
import { useSettings } from "./SettingsProvider";
import { useToast } from "./ToastContainer";
import { Icons } from "./Icons";
import { supabaseClient } from "@/lib/supabase-client";
import { useTranslation } from "react-i18next";
import BandLogoFrame from "./BandLogoFrame";
import BandInviteModal from "./BandInviteModal";
import ToggleSwitch from "./ToggleSwitch";
import Avatar from "./Avatar";
import { normalizeArrayResponse } from "@/lib/api-response";
import { readAsDataUrl } from "@/lib/file-utils";
import { getBandMemberAvatarUrl, getBandMemberInitial } from "@/lib/member-avatar";

interface Band {
  id: string;
  name: string;
  userId?: string;
  logoUrl?: string | null;
  color?: string | null;
  /** Whether bandmates may edit gigs they are shared on. */
  canMembersEdit?: boolean | null;
  inviteCode?: string | null;
  chatType?: string | null;
  chatUrl?: string | null;
  isOwner?: boolean;
  isLeader?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BandMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  avatarUrl?: string | null;
  bands: string[];
  isLeader?: boolean;
  updatedAt: string;
}

function BandMemberAvatar({
  name,
  email,
  avatarUrl,
  fallbackAvatarUrl,
}: Pick<BandMember, "name" | "email" | "avatarUrl"> & { fallbackAvatarUrl?: string | null }) {
  const resolvedAvatarUrl = getBandMemberAvatarUrl(name, avatarUrl, fallbackAvatarUrl);

  if (resolvedAvatarUrl) {
    return <Avatar src={resolvedAvatarUrl} name={name} email={email} size="xs" />;
  }

  return (
    <span
      aria-label={`${name} avatar`}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[10px] font-semibold uppercase leading-none text-slate-700 shadow-sm ring-1 ring-inset ring-white/70 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-900/50"
    >
      {getBandMemberInitial(name)}
    </span>
  );
}

export default function BandsTab() {
  const { getAccessToken, session } = useAuth();
  const { language, excludeSelfFromMemberCount } = useSettings();
  const toast = useToast();
  const { t } = useTranslation();

  const [bands, setBands] = useState<Band[]>([]);
  const [members, setMembers] = useState<BandMember[]>([]);
  const [bandMembersByBandId, setBandMembersByBandId] = useState<Record<string, BandMember[]>>({});
  const [memberError, setMemberError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBand, setEditingBand] = useState<Band | null>(null);
  const [expandedBandId, setExpandedBandId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    logoUrl: "",
    color: "#bfdbfe",
    canMembersEdit: false,
    chatType: "",
    chatUrl: "",
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  // Which band's invite dialog is open, if any.
  const [inviteBand, setInviteBand] = useState<Band | null>(null);
  const [togglingMemberId, setTogglingMemberId] = useState<string | null>(null);

  const loadBands = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No auth token");
      const response = await fetch("/api/bands", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(t('bands.errorLoad'));
      const data = await response.json();
      setBands(data);
    } catch (error) {
      toast.error(t('bands.errorLoad'));
    }
  }, [getAccessToken, toast, t('bands.errorLoad')]);

  const loadMembers = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) {
        setMembers([]);
        setMemberError(null);
        return;
      }

      const response = await fetch("/api/band-members", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        if (response.status === 401) {
          setMembers([]);
          setMemberError(null);
          return;
        }

        const message = await response.text();
        throw new Error(message || t('bands.errorMembers'));
      }

      const data = await response.json().catch(() => []);
      const nextMembers = normalizeArrayResponse<BandMember>(data);
      setMembers(nextMembers);
      setMemberError(null);
    } catch (error) {
      console.error("Failed to load members:", error);
      setMemberError(t('bands.errorMembers'));
      setMembers([]);
    }
  }, [getAccessToken, t('bands.errorMembers')]);

  const loadBandRosters = useCallback(async () => {
    if (bands.length === 0) return;
    try {
      const token = await getAccessToken();
      if (!token) return;
      const results = await Promise.all(
        bands.map(async (band) => {
          const response = await fetch(`/api/bands/${band.id}/members`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!response.ok) throw new Error(`Failed to load roster for ${band.id}`);
          return [band.id, normalizeArrayResponse<BandMember>(await response.json())] as const;
        })
      );
      setBandMembersByBandId(Object.fromEntries(results));
    } catch (error) {
      console.error("Failed to load band rosters:", error);
    }
  }, [bands, getAccessToken]);

  const loadUserAsMember = useCallback(async () => {
    if (!session?.user) return;
    
    try {
      const token = await getAccessToken();
      if (!token) return;

      const setlistsResponse = await fetch("/api/setlists", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!setlistsResponse.ok) return;
      
      const setlists = await setlistsResponse.json();
      const userBandIds = new Set(
        setlists
          .filter((s: any) => s.bandId)
          .map((s: any) => s.bandId)
      );
      const currentUserAvatar = session.user.user_metadata?.avatar_url || null;
      
      if (userBandIds.size > 0) {
        const userBandNames = bands
          .filter(b => userBandIds.has(b.id))
          .map(b => b.name);
        
        if (userBandNames.length > 0) {
          const currentUserName = session.user.user_metadata?.name || session.user.email || "You";
          const userMember: BandMember = {
            id: "current-user",
            name: currentUserName,
            email: session.user.email,
            phone: null,
            notes: null,
            avatarUrl: getBandMemberAvatarUrl(currentUserName, currentUserAvatar, currentUserAvatar),
            bands: userBandNames,
            isLeader: true,
            updatedAt: new Date().toISOString(),
          };
          
          setMembers(prev => {
            const existingIndex = prev.findIndex(m => m.id === "current-user");
            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = userMember;
              return updated;
            }
            return [...prev, userMember];
          });
        }
      }
    } catch (error) {
      console.error("Failed to load user as member:", error);
    }
  }, [session, getAccessToken, bands]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([loadBands(), loadMembers()]);
      setLoading(false);
    };
    loadData();
  }, [loadBands, loadMembers]);

  // Load user as member after bands are loaded
  useEffect(() => {
    if (bands.length > 0) {
      loadUserAsMember();
      void loadBandRosters();
    }
  }, [bands, loadUserAsMember, loadBandRosters]);

  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const fileName = `band-logo-${Date.now()}-${crypto.randomUUID()}.${ext}`;
      
      console.log("Uploading logo to Supabase songs bucket:", fileName);
      const { error, data } = await supabaseClient.storage.from("songs").upload(fileName, file, { upsert: true });
      
      if (error) {
        console.error("Supabase upload error:", error);
        // Fallback to base64 data URL if Supabase upload fails
        console.log("Using fallback base64 encoding");
        const fallbackUrl = await readAsDataUrl(file);
        setLogoPreview(fallbackUrl);
        setFormData({ ...formData, logoUrl: fallbackUrl });
        toast.warning(t('bands.logoUploadWarning'));
        return;
      }
      
      console.log("Upload successful:", data);
      const { data: publicUrlData } = supabaseClient.storage.from("songs").getPublicUrl(fileName);
      console.log("Public URL:", publicUrlData.publicUrl);
      setLogoPreview(publicUrlData.publicUrl);
      setFormData({ ...formData, logoUrl: publicUrlData.publicUrl });
    } catch (error: any) {
      console.error("Logo upload error:", error);
      toast.error(t('bands.logoUploadError'));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error(t('bands.nameRequired'));
      return;
    }

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No auth token");

      if (editingBand) {
        // Update existing band (only logo and color can be edited)
        const response = await fetch("/api/bands", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            id: editingBand.id,
            logoUrl: formData.logoUrl || null,
            color: formData.color,
            canMembersEdit: formData.canMembersEdit,
            chatType: formData.chatType || null,
            chatUrl: formData.chatUrl || null,
          }),
        });

        if (!response.ok) throw new Error(t('bands.errorSave'));
        toast.success(t('bands.successUpdate'));
      } else {
        // Create new band
        const response = await fetch("/api/bands", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ 
            name: formData.name.trim(), 
            logoUrl: formData.logoUrl || null, 
            color: formData.color,
            chatType: formData.chatType || null,
            chatUrl: formData.chatUrl || null,
          }),
        });

        if (!response.ok) throw new Error(t('bands.errorSave'));
        toast.success(t('bands.successAdd'));
      }

      setShowForm(false);
      setEditingBand(null);
      setExpandedBandId(null);
      setFormData({ name: "", logoUrl: "", color: "#bfdbfe", canMembersEdit: false, chatType: "", chatUrl: "" });
      setLogoPreview(null);
      loadBands();
    } catch (error) {
      toast.error(t('bands.errorSave'));
    }
  };

  const handleEdit = (band: Band) => {
    setEditingBand(band);
    setFormData({
      name: band.name,
      logoUrl: band.logoUrl || "",
      color: band.color || "#bfdbfe",
      canMembersEdit: Boolean(band.canMembersEdit),
      chatType: band.chatType || "",
      chatUrl: band.chatUrl || "",
    });
    setLogoPreview(band.logoUrl || null);
    setExpandedBandId(band.id);
  };

  const handleCancelEdit = () => {
    setEditingBand(null);
    setExpandedBandId(null);
    setFormData({ name: "", logoUrl: "", color: "#bfdbfe", canMembersEdit: false, chatType: "", chatUrl: "" });
    setLogoPreview(null);
  };

  const handleDelete = async (band: Band) => {
    if (!confirm(t('bands.confirmDelete'))) {
      return;
    }

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No auth token");

      const response = await fetch(`/api/bands/${band.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error(t('bands.errorDelete'));

      toast.success(t('bands.successDelete'));
      loadBands();
    } catch (error) {
      toast.error(t('bands.errorDelete'));
    }
  };

  const handleToggleLeader = async (member: BandMember, band: Band) => {
    if (member.id === "current-user") {
      toast.warning(
        language === "nl"
          ? "Je eigen leiderschapsrol kan hier niet aangepast worden"
          : "Your own leadership role cannot be changed here"
      );
      return;
    }

    try {
      setTogglingMemberId(member.id);
      const token = await getAccessToken();
      if (!token) return;

      const nextIsLeader = !member.isLeader;
      const res = await fetch(`/api/band-members/${member.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isLeader: nextIsLeader }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update leader status");
      }

      setMembers((prev) =>
        prev.map((m) =>
          m.id === member.id ? { ...m, isLeader: nextIsLeader } : m
        )
      );
      setBandMembersByBandId((prev) => ({
        ...prev,
        [band.id]: (prev[band.id] || []).map((m) =>
          m.id === member.id ? { ...m, isLeader: nextIsLeader } : m
        ),
      }));

      toast.success(
        nextIsLeader
          ? (language === "nl"
              ? `${member.name} is nu bandleider`
              : `${member.name} is now a band leader`)
          : (language === "nl"
              ? `Leidersrol ingetrokken voor ${member.name}`
              : `Removed leader role for ${member.name}`)
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to update leader status");
    } finally {
      setTogglingMemberId(null);
    }
  };


  const getBandMembers = (bandId: string) => {
    const band = bands.find(b => b.id === bandId);
    if (!band) return [];
    const filtered = [
      ...(bandMembersByBandId[bandId] || members.filter((member) => member.bands?.includes(band.name))),
    ];
    // Include current user if setting allows it
    const currentUser = members.find(m => m.id === "current-user");
    if (currentUser && !excludeSelfFromMemberCount && !filtered.includes(currentUser)) {
      filtered.push(currentUser);
    }
    return filtered;
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent"></div>
      </div>
    );
  }

  const renderMemberEmptyState = () => (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
      <Icons.People className="mx-auto mb-3 h-10 w-10 text-slate-500" />
      <p className="text-base font-medium text-slate-700 dark:text-slate-200">
        {memberError ? "Couldn’t load band members" : t('bands.noMembersYet') || "No band members yet"}
      </p>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        {memberError ? "Please retry to refresh the list." : "Add a member to this band to start tracking payments."}
      </p>
      {memberError && (
        <button
          type="button"
          onClick={() => {
            setMemberError(null);
            loadMembers();
          }}
          className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Retry
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t('bands.title')}</h1>
        <button
          onClick={() => {
            setEditingBand(null);
            setFormData({ name: "", logoUrl: "", color: "#bfdbfe", canMembersEdit: false, chatType: "", chatUrl: "" });
            setLogoPreview(null);
            setShowForm(true);
          }}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600"
        >
          {t('bands.addBand')}
        </button>
      </div>

      {showForm && (
        <div className="surface-card rounded-2xl p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {editingBand ? t('bands.editBand') : t('bands.addBand')}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('bands.name')}
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {language === "nl" ? "Accentkleur" : "Accent Color"}
              </label>
              <div className="mt-2">
                <div className="grid grid-cols-8 gap-2 mb-3">
                  {[
                    '#fecaca', // pastel red
                    '#fed7aa', // pastel orange
                    '#fef08a', // pastel yellow
                    '#bbf7d0', // pastel green
                    '#a5f3fc', // pastel cyan
                    '#bfdbfe', // pastel blue
                    '#ddd6fe', // pastel purple
                    '#fbcfe8', // pastel pink
                    '#f5d0fe', // pastel fuchsia
                    '#fecdd3', // pastel rose
                    '#99f6e4', // pastel teal
                    '#d9f99d', // pastel lime
                    '#fde68a', // pastel amber
                    '#e0e7ff', // pastel indigo
                    '#f3e8ff', // pastel violet
                    '#e5e7eb', // pastel gray
                  ].map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData({ ...formData, color })}
                      className={`h-8 w-8 rounded-lg border-2 transition hover:scale-110 ${
                        formData.color === color
                          ? 'border-slate-900 dark:border-white'
                          : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="h-10 w-20 rounded-lg border border-slate-300 bg-white cursor-pointer focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800"
                  />
                  <span className="text-sm text-slate-500 dark:text-slate-400">{formData.color}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('bands.logo')}
              </label>
              <div className="mt-2 flex items-center gap-4">
                {logoPreview && (
                  <BandLogoFrame src={logoPreview} alt="Logo preview" size="lg" />
                )}
                <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  {uploadingLogo ? "Uploading..." : t('bands.uploadLogo')}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoUpload(file);
                    }}
                    className="hidden"
                  />
                </label>
                {logoPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogoPreview(null);
                      setFormData({ ...formData, logoUrl: "" });
                    }}
                    className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    {t('bands.removeLogo')}
                  </button>
                )}
              </div>
            </div>

            {/* v1.48.0: External group chat link configuration */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {language === "nl" ? "Chat platform" : "Chat Platform"}
              </label>
              <select
                value={formData.chatType}
                onChange={(e) => setFormData({ ...formData, chatType: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              >
                <option value="">{language === "nl" ? "Geen chat" : "No chat"}</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="messenger">Messenger</option>
                <option value="telegram">Telegram</option>
                <option value="signal">Signal</option>
                <option value="discord">Discord</option>
                <option value="custom_url">{language === "nl" ? "Aangepaste URL" : "Custom URL"}</option>
              </select>
            </div>

            {formData.chatType && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {language === "nl" ? "Chat link / URL" : "Chat Link / URL"}
                </label>
                <input
                  type="url"
                  value={formData.chatUrl}
                  onChange={(e) => setFormData({ ...formData, chatUrl: e.target.value })}
                  placeholder={language === "nl" ? "https://..." : "https://..."}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {language === "nl"
                    ? "De chatknop in gigkaarten opent deze link in een nieuw tabblad."
                    : "The chat button in gig cards opens this link in a new tab."}
                </p>
              </div>
            )}

            {/* Only meaningful when editing: a brand new band has no members
                to grant anything to yet. */}
            {editingBand && (
              <ToggleSwitch
                id="band-can-members-edit"
                testId="band-can-members-edit"
                checked={formData.canMembersEdit}
                onChange={(next) =>
                  setFormData((prev) => ({ ...prev, canMembersEdit: next }))
                }
                label={
                  language === "nl"
                    ? "Leden mogen optredens bewerken"
                    : "Allow members to edit gigs"
                }
                description={
                  language === "nl"
                    ? "Leden zien standaard alleen gedeelde optredens. Met deze aan mogen ze die ook aanpassen."
                    : "Members can see gigs they are shared on. Turn this on to let them edit those gigs too."
                }
              />
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingBand(null);
                  setFormData({ name: "", logoUrl: "", color: "#6366f1", canMembersEdit: false, chatType: "", chatUrl: "" });
                  setLogoPreview(null);
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t('bands.cancel')}
              </button>
              <button
                type="submit"
                disabled={uploadingLogo}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600 disabled:opacity-50"
              >
                {t('bands.save')}
              </button>
            </div>
          </form>
        </div>
      )}

     {bands.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center dark:border-slate-700 dark:bg-slate-900/50">
          <Icons.People className="mx-auto mb-4 h-12 w-12 text-slate-500" />
          <p className="text-slate-600 dark:text-slate-400">{t('bands.noBandsYet')}</p>
          <p className="mt-2 text-sm text-slate-500">{t('bands.addFirstBand')}</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {bands.map((band) => {
            const bandMembers = getBandMembers(band.id);
            const isExpanded = expandedBandId === band.id;
            const isEditing = editingBand?.id === band.id;
            const isLeaderOrOwner = Boolean(
              band.isOwner ??
              (band.isLeader ?? (session?.user?.id && band.userId === session.user.id))
            );
            return (
              <div key={band.id} className="rounded-2xl border bg-white dark:bg-slate-900 overflow-hidden" style={{ borderColor: band.color || '#e2e8f0' }}>
                {isEditing ? (
                  <div className="p-6">
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                          {language === "nl" ? "Accentkleur" : "Accent Color"}
                        </label>
                        <div className="mt-2">
                          <div className="grid grid-cols-8 gap-2 mb-3">
                            {[
                              '#fecaca', // pastel red
                              '#fed7aa', // pastel orange
                              '#fef08a', // pastel yellow
                              '#bbf7d0', // pastel green
                              '#a5f3fc', // pastel cyan
                              '#bfdbfe', // pastel blue
                              '#ddd6fe', // pastel purple
                              '#fbcfe8', // pastel pink
                              '#f5d0fe', // pastel fuchsia
                              '#fecdd3', // pastel rose
                              '#99f6e4', // pastel teal
                              '#d9f99d', // pastel lime
                              '#fde68a', // pastel amber
                              '#e0e7ff', // pastel indigo
                              '#f3e8ff', // pastel violet
                              '#e5e7eb', // pastel gray
                            ].map((color) => (
                              <button
                                key={color}
                                type="button"
                                onClick={() => setFormData({ ...formData, color })}
                                className={`h-8 w-8 rounded-lg border-2 transition hover:scale-110 ${
                                  formData.color === color
                                    ? 'border-slate-900 dark:border-white'
                                    : 'border-transparent'
                                }`}
                                style={{ backgroundColor: color }}
                                title={color}
                              />
                            ))}
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={formData.color}
                              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                              className="h-10 w-20 rounded-lg border border-slate-300 bg-white cursor-pointer focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800"
                            />
                            <span className="text-sm text-slate-500 dark:text-slate-400">{formData.color}</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t('bands.logo')}
                        </label>
                        <div className="mt-2 flex items-center gap-4">
                          {logoPreview && (
                            <BandLogoFrame src={logoPreview} alt="Logo preview" size="lg" />
                          )}
                          <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                            {uploadingLogo ? "Uploading..." : t('bands.uploadLogo')}
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleLogoUpload(file);
                              }}
                              className="hidden"
                            />
                          </label>
                          {logoPreview && (
                            <button
                              type="button"
                              onClick={() => {
                                setLogoPreview(null);
                                setFormData({ ...formData, logoUrl: "" });
                              }}
                              className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                            >
                              {t('bands.removeLogo')}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* v1.48.0: External group chat link configuration */}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                          {language === "nl" ? "Chat platform" : "Chat Platform"}
                        </label>
                        <select
                          value={formData.chatType}
                          onChange={(e) => setFormData({ ...formData, chatType: e.target.value })}
                          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        >
                          <option value="">{language === "nl" ? "Geen chat" : "No chat"}</option>
                          <option value="whatsapp">WhatsApp</option>
                          <option value="messenger">Messenger</option>
                          <option value="telegram">Telegram</option>
                          <option value="signal">Signal</option>
                          <option value="discord">Discord</option>
                          <option value="custom_url">{language === "nl" ? "Aangepaste URL" : "Custom URL"}</option>
                        </select>
                      </div>

                      {formData.chatType && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            {language === "nl" ? "Chat link / URL" : "Chat Link / URL"}
                          </label>
                          <input
                            type="url"
                            value={formData.chatUrl}
                            onChange={(e) => setFormData({ ...formData, chatUrl: e.target.value })}
                            placeholder={language === "nl" ? "https://..." : "https://..."}
                            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          />
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {language === "nl"
                              ? "De chatknop in gigkaarten opent deze link in een nieuw tabblad."
                              : "The chat button in gig cards opens this link in a new tab."}
                          </p>
                        </div>
                      )}

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {t('bands.cancel')}
                        </button>
                        <button
                          type="submit"
                          disabled={uploadingLogo}
                          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600 disabled:opacity-50"
                        >
                          {t('bands.save')}
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <>
                    <div className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          {band.logoUrl && (
                            <BandLogoFrame src={band.logoUrl} alt={band.name} size="md" />
                          )}
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{band.name}</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              {bandMembers.length} {language === "nl" ? "leden" : "members"}
                            </p>
                          </div>
                        </div>
                        {isLeaderOrOwner && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEdit(band)}
                              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                              title={language === "nl" ? "Band bewerken" : "Edit band"}
                              aria-label={language === "nl" ? "Band bewerken" : "Edit band"}
                            >
                              <Icons.Edit className="h-4 w-4" />
                            </button>
                            {band.isOwner !== false && (
                              <button
                                onClick={() => handleDelete(band)}
                                className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                                title={language === "nl" ? "Band verwijderen" : "Delete band"}
                                aria-label={language === "nl" ? "Band verwijderen" : "Delete band"}
                              >
                                <Icons.Trash className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {bandMembers.length > 0 ? (
                        <div className="mt-4">
                          <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">{t('bands.bandMembers')}</p>
                          <div className="flex flex-wrap gap-2">
                            {bandMembers.map((member) => (
                              <span
                                key={member.id}
                                className={`inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs transition-colors ${
                                  member.isLeader
                                    ? "bg-amber-50 text-amber-900 ring-1 ring-amber-400/40 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-500/30"
                                    : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                }`}
                              >
                                <BandMemberAvatar
                                  name={member.name}
                                  email={member.email}
                                  avatarUrl={member.avatarUrl}
                                  fallbackAvatarUrl={session?.user?.user_metadata?.avatar_url || null}
                                />
                                <span className="font-medium">{member.name}</span>
                                {member.isLeader && (
                                  <span
                                    data-testid={`leader-badge-${member.id}`}
                                    className="inline-flex items-center gap-0.5 rounded-full bg-amber-200/80 dark:bg-amber-900/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-200"
                                    title={language === "nl" ? "Bandleider" : "Band Leader"}
                                  >
                                    👑 {language === "nl" ? "Leider" : "Leader"}
                                  </span>
                                )}
                                {isLeaderOrOwner && member.id !== "current-user" && (
                                  <button
                                    type="button"
                                    data-testid={`toggle-leader-${member.id}`}
                                    disabled={togglingMemberId === member.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleLeader(member, band);
                                    }}
                                    className={`rounded-full p-0.5 text-xs transition-transform hover:scale-125 disabled:opacity-50 ${
                                      member.isLeader
                                        ? "text-amber-600 dark:text-amber-400 hover:text-amber-700"
                                        : "text-slate-400 hover:text-amber-500 opacity-60 hover:opacity-100"
                                    }`}
                                    title={
                                      member.isLeader
                                        ? (language === "nl" ? "Leidersrol intrekken" : "Revoke leader role")
                                        : (language === "nl" ? "Maak bandleider" : "Promote to band leader")
                                    }
                                    aria-label={
                                      member.isLeader
                                        ? (language === "nl" ? `Leidersrol intrekken voor ${member.name}` : `Revoke leader role for ${member.name}`)
                                        : (language === "nl" ? `Maak ${member.name} bandleider` : `Promote ${member.name} to band leader`)
                                    }
                                  >
                                    👑
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4">
                          {renderMemberEmptyState()}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setInviteBand(band)}
                        data-testid="band-invite-button"
                        className="touch-target mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50/70 px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-100/70 dark:border-brand-800/70 dark:bg-brand-950/30 dark:text-brand-300 dark:hover:bg-brand-900/40"
                      >
                        <Icons.Plus className="h-4 w-4 shrink-0" />
                        {isLeaderOrOwner
                          ? language === "nl"
                            ? "Uitnodigings-QR genereren"
                            : "Generate invite QR code"
                          : language === "nl"
                            ? "Uitnodigingscode bekijken"
                            : "View invite code"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {inviteBand && (
        <BandInviteModal
          bandId={inviteBand.id}
          bandName={inviteBand.name}
          isDutch={language === "nl"}
          readOnly={!Boolean(inviteBand.isOwner || inviteBand.isLeader)}
          onClose={() => setInviteBand(null)}
        />
      )}
    </div>
  );
}

