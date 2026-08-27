import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Play, Pause, RotateCcw, Eye, EyeOff, Star } from "lucide-react";

// ============================================================
// コアエンジン（UIに依存しない純粋なロジック層）
// ============================================================

// 度数記号定義（12種・確定仕様）
const DEGREES = [
  { key: "①", semitone: 0, shape: "star", filled: false },
  { key: "♭2", semitone: 1, shape: "rect", filled: true },
  { key: "②", semitone: 2, shape: "rect", filled: false },
  { key: "♭3", semitone: 3, shape: "triangle", filled: true },
  { key: "③", semitone: 4, shape: "triangle", filled: false },
  { key: "④", semitone: 5, shape: "square", filled: false },
  { key: "♭5", semitone: 6, shape: "circle", filled: true },
  { key: "⑤", semitone: 7, shape: "circle", filled: false },
  { key: "♭6", semitone: 8, shape: "moonThick", filled: true },
  { key: "⑥", semitone: 9, shape: "moonThin", filled: false },
  { key: "♭7", semitone: 10, shape: "diamond", filled: true },
  { key: "⑦", semitone: 11, shape: "diamond", filled: false },
];
const DEGREE_MAP = Object.fromEntries(DEGREES.map((d) => [d.key, d]));

// インターバル（音程）色定義（0〜12半音・Figma確定データ）
const INTERVALS = [
  { st: 0, name: "完全1度（ユニゾン）", colorName: "木目（基準色）", grad: ["#8B5E3C", "#653043", "#3E2723"], text: "#fff", nuance: "基準となる音そのもの（変化なし）" },
  { st: 1, name: "短2度", colorName: "青 メタリック", grad: ["#3B82F6", "#2359CB", "#1744B5", "#0B2F9F"], text: "#fff", nuance: "最も近い、ぶつかりの音（半音）" },
  { st: 2, name: "長2度", colorName: "赤 メタリック", grad: ["#EF4444", "#BF2929", "#A61C1C", "#8E0E0E"], text: "#fff", nuance: "明るくはっきりとした上昇" },
  { st: 3, name: "短3度", colorName: "紫 メタリック", grad: ["#A78BFA", "#9070E1", "#7A54C8", "#6339AE", "#4C1D95"], text: "#fff", nuance: "哀しく神秘的な暗さ" },
  { st: 4, name: "長3度", colorName: "ゴールド メタリック", grad: ["#FBBF24", "#DA9D1F", "#BA7A1A", "#995814", "#78350F"], text: "#1a1a1a", nuance: "明るく安定した響き" },
  { st: 5, name: "完全4度", colorName: "エメラルド メタリック", grad: ["#34D399", "#29B282", "#1D916A", "#126F53", "#064E3B"], text: "#1a1a1a", nuance: "安定・清潔、落ち着きの中間点" },
  { st: 6, name: "増4度 / 減5度（トライトーン）", colorName: "ガンメタル", grad: ["#64748B", "#414F63", "#303C4F", "#1E293B"], text: "#fff", nuance: "ちょうど中間で不安定、悪魔の音程" },
  { st: 7, name: "完全5度", colorName: "ライム", grad: ["#A3E635", "#71A424", "#58831B", "#3F6212"], text: "#1a1a1a", nuance: "安定・力強い響き" },
  { st: 8, name: "増5度 / 短6度", colorName: "カッパー（銅）メタリック", grad: ["#F97316", "#BB5014", "#9B3F13", "#7C2D12"], text: "#fff", nuance: "5度を超えた広がり" },
  { st: 9, name: "長6度", colorName: "ターコイズ メタリック", grad: ["#22D3EE", "#1CABC4", "#158399", "#0F5B6F", "#083344"], text: "#1a1a1a", nuance: "広がり、問題なく緊張の緩和" },
  { st: 10, name: "短7度", colorName: "マゼンタ メタリック", grad: ["#F472B6", "#D35CA6", "#B24696", "#913085", "#701A75"], text: "#fff", nuance: "緊張感、ブルース的、解決への一歩" },
  { st: 11, name: "長7度", colorName: "プラチナ メタリック", grad: ["#E2E8F0", "#BBC3CE", "#959FAD", "#6E7A8B", "#475569"], text: "#1a1a1a", nuance: "解決へ→強い引力（一歩手前）" },
  { st: 12, name: "完全8度（オクターブ）", colorName: "パール（虹色）", grad: ["#FFE4E6", "#E0B4F1", "#C084FC", "#9275F7", "#6366F1"], text: "#1a1a1a", nuance: "同じ音に戻る完全な一周" },
];
const INTERVAL_MAP = Object.fromEntries(INTERVALS.map((i) => [i.st, i]));

// インターバル自動判定：隣接する2音の度数差から半音距離を算出
function resolveInterval(a, b) {
  const da = DEGREE_MAP[a];
  const db = DEGREE_MAP[b];
  if (!da || !db) return null;
  const dist = Math.min(Math.abs(da.semitone - db.semitone), 12 - Math.abs(da.semitone - db.semitone) + 12 > 12 ? Math.abs(da.semitone - db.semitone) : Math.abs(da.semitone - db.semitone));
  const raw = Math.abs(da.semitone - db.semitone);
  return INTERVAL_MAP[raw] ?? INTERVAL_MAP[12 - raw];
}

// フレーズ配列 → 再生ステップ列（音 → インターバル色 → 次の音…）
function buildSteps(phrase) {
  const steps = [];
  phrase.forEach((deg, i) => {
    steps.push({ type: "note", degree: deg, index: i });
    if (i < phrase.length - 1) {
      const iv = resolveInterval(phrase[i], phrase[i + 1]);
      steps.push({ type: "interval", interval: iv, from: deg, to: phrase[i + 1] });
    }
  });
  return steps;
}

function parsePhrase(input) {
  const tokens = input.split(/[\s,、]+/).filter(Boolean);
  return tokens.filter((t) => DEGREE_MAP[t]);
}

// ============================================================
// 記号レンダリング（SVG）
// ============================================================
function DegreeGlyph({ shape, filled, color = "#14121F", size = 84 }) {
  const fill = filled ? color : "none";
  const stroke = color;
  const sw = 7;
  const common = { fill, stroke, strokeWidth: sw, strokeLinejoin: "round" };
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {shape === "star" && <path d="M50 8 L61 38 L94 38 L67 57 L78 90 L50 70 L22 90 L33 57 L6 38 L39 38 Z" {...common} />}
      {shape === "rect" && <rect x="15" y="38" width="70" height="24" rx="3" {...common} />}
      {shape === "triangle" && <path d="M50 16 L86 82 L14 82 Z" {...common} />}
      {shape === "square" && <rect x="27" y="27" width="46" height="46" {...common} />}
      {shape === "circle" && <circle cx="50" cy="50" r="30" {...common} />}
      {shape === "diamond" && <path d="M50 12 L88 50 L50 88 L12 50 Z" {...common} />}
      {shape === "moonThick" && (
        <path d="M62 14 A36 36 0 1 0 62 86 A26 26 0 1 1 62 14 Z" fill={filled ? color : "none"} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      )}
      {shape === "moonThin" && (
        <path d="M58 18 A32 32 0 1 0 58 82 A38 38 0 1 1 58 18 Z" fill={filled ? color : "none"} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      )}
    </svg>
  );
}

function radialGrad(stops) {
  const n = stops.length;
  const parts = stops.map((c, i) => `${c} ${Math.round((i / (n - 1)) * 100)}%`);
  return `radial-gradient(circle at 30% 22%, ${parts.join(", ")})`;
}

// ============================================================
// メイン
// ============================================================
export default function IntervalMapPrototype() {
  const [phraseInput, setPhraseInput] = useState("① ③ ② ④ ③ ⑤ ④ ⑥");
  const [noteMs, setNoteMs] = useState(900);
  const [intervalMs, setIntervalMs] = useState(350);
  const [loop, setLoop] = useState(true);
  const [cleanMode, setCleanMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const timerRef = useRef(null);

  const phrase = useMemo(() => parsePhrase(phraseInput), [phraseInput]);
  const steps = useMemo(() => buildSteps(phrase), [phrase]);

  const stop = useCallback(() => {
    setIsPlaying(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const play = useCallback(() => {
    if (steps.length === 0) return;
    setIsPlaying(true);
    setStepIndex(0);
  }, [steps]);

  useEffect(() => {
    if (!isPlaying) return;
    if (steps.length === 0) return;
    const current = steps[stepIndex];
    const duration = current.type === "note" ? noteMs : intervalMs;
    timerRef.current = setTimeout(() => {
      const next = stepIndex + 1;
      if (next >= steps.length) {
        if (loop) setStepIndex(0);
        else setIsPlaying(false);
      } else {
        setStepIndex(next);
      }
    }, duration);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, stepIndex, steps, noteMs, intervalMs, loop]);

  useEffect(() => stop, [stop]);

  const current = steps[stepIndex];
  const currentDegreeIndex = current
    ? current.type === "note"
      ? current.index
      : phrase.indexOf(current.from)
    : -1;

  return (
    <div
      style={{
        minHeight: "100%",
        width: "100%",
        background: "radial-gradient(ellipse at 50% -10%, #171B33 0%, #0A0E1A 55%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "32px 16px 40px",
        fontFamily:
          "'Hiragino Maru Gothic ProN','Hiragino Maru Gothic Pro','Yu Gothic',sans-serif",
        color: "#F0EDFF",
        gap: 24,
        boxSizing: "border-box",
      }}
    >
      {/* ヘッダー */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11, letterSpacing: 4, color: "#8B87A8", marginBottom: 4 }}>
          INTERVAL MAP — PROTOTYPE
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>音の地図</div>
      </div>

      {/* ===== 縦長プレビュー画面（9:16） ===== */}
      <div
        style={{
          position: "relative",
          width: 260,
          aspectRatio: "9 / 16",
          borderRadius: 26,
          overflow: "hidden",
          background: "#050710",
          border: "1px solid #2E3358",
          boxShadow: "0 0 0 6px #0D1024, 0 30px 60px -20px rgba(0,0,0,0.7)",
        }}
      >
        {/* 中心マーク（トニック） */}
        <div
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            zIndex: 5,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: "#D9B36C",
            letterSpacing: 1,
          }}
        >
          <Star size={13} fill="#D9B36C" stroke="none" />
          C メジャー
        </div>
        {!cleanMode && (
          <div
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              zIndex: 5,
              fontSize: 10,
              color: "#5B5878",
            }}
          >
            {steps.length ? `${stepIndex + 1} / ${steps.length}` : "—"}
          </div>
        )}

        {/* パネル（横に流れる） */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            transform: `translateX(-${stepIndex * 100}%)`,
            transition: "transform 260ms cubic-bezier(.4,0,.2,1)",
          }}
        >
          {steps.length === 0 && (
            <div
              style={{
                minWidth: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#5B5878",
                fontSize: 13,
                textAlign: "center",
                padding: 24,
              }}
            >
              度数を入力すると
              <br />
              ここにプレビューが流れます
            </div>
          )}
          {steps.map((s, i) => {
            if (s.type === "note") {
              const d = DEGREE_MAP[s.degree];
              return (
                <div
                  key={i}
                  style={{
                    minWidth: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 18,
                    background: "#EAE7F5",
                  }}
                >
                  <DegreeGlyph shape={d.shape} filled={d.filled} size={90} />
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#14121F" }}>{s.degree}</div>
                  <div
                    style={{
                      position: "absolute",
                      bottom: 16,
                      fontSize: 9,
                      color: "#8B87A8",
                      letterSpacing: 0.5,
                    }}
                  >
                    背景色：未確定（仮）
                  </div>
                </div>
              );
            }
            const iv = s.interval;
            return (
              <div
                key={i}
                style={{
                  minWidth: "100%",
                  height: "100%",
                  position: "relative",
                  overflow: "hidden",
                  background: radialGrad(iv.grad),
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  padding: "0 22px 90px",
                  color: iv.text,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -10,
                    left: 8,
                    fontSize: 128,
                    fontWeight: 800,
                    color: iv.text === "#fff" ? "rgba(255,255,255,0.12)" : "rgba(26,26,26,0.12)",
                    lineHeight: 1,
                  }}
                >
                  {iv.st}
                </div>
                <div style={{ fontSize: 13, opacity: 0.65, marginBottom: 4 }}>半音</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 14 }}>{iv.name}</div>
                <div style={{ fontSize: 14, fontWeight: 700, opacity: 0.9, marginBottom: 6 }}>
                  {iv.colorName}
                </div>
                <div style={{ fontSize: 11, opacity: 0.6, lineHeight: 1.6 }}>{iv.nuance}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 進行インジケーター（星座風） */}
      {!cleanMode && phrase.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {phrase.map((_, i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: i === currentDegreeIndex ? "#D9B36C" : "#2E3358",
                transition: "background 200ms",
              }}
            />
          ))}
        </div>
      )}

      {/* ===== 制作者コントロールパネル ===== */}
      {!cleanMode && (
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: "#0D1024",
            border: "1px solid #202544",
            borderRadius: 16,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div>
            <label style={{ fontSize: 11, color: "#8B87A8", letterSpacing: 1 }}>
              フレーズ入力（度数を半角スペース区切り）
            </label>
            <input
              value={phraseInput}
              onChange={(e) => setPhraseInput(e.target.value)}
              style={{
                width: "100%",
                marginTop: 6,
                background: "#050710",
                border: "1px solid #2E3358",
                borderRadius: 8,
                color: "#F0EDFF",
                padding: "10px 12px",
                fontSize: 15,
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
            <div style={{ fontSize: 10, color: "#5B5878", marginTop: 4 }}>
              使用可能：① ♭2 ② ♭3 ③ ④ ♭5 ⑤ ♭6 ⑥ ♭7 ⑦
            </div>
          </div>

          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "#8B87A8" }}>音の表示時間：{noteMs}ms</label>
              <input
                type="range"
                min={400}
                max={2000}
                step={50}
                value={noteMs}
                onChange={(e) => setNoteMs(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "#8B87A8" }}>
                インターバル表示：{intervalMs}ms
              </label>
              <input
                type="range"
                min={200}
                max={500}
                step={10}
                value={intervalMs}
                onChange={(e) => setIntervalMs(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => (isPlaying ? stop() : play())}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "#D9B36C",
                color: "#14121F",
                border: "none",
                borderRadius: 999,
                padding: "9px 18px",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              {isPlaying ? "一時停止" : "再生"}
            </button>
            <button
              onClick={() => {
                stop();
                setStepIndex(0);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "transparent",
                color: "#8B87A8",
                border: "1px solid #2E3358",
                borderRadius: 999,
                padding: "9px 14px",
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <RotateCcw size={13} />
              最初から
            </button>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "#8B87A8",
                marginLeft: "auto",
                cursor: "pointer",
              }}
            >
              <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
              ループ
            </label>
          </div>

          <button
            onClick={() => setCleanMode(true)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              background: "transparent",
              color: "#5B5878",
              border: "1px dashed #2E3358",
              borderRadius: 10,
              padding: "8px 12px",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <EyeOff size={13} />
            クリーン再生画面（録画用・UI非表示）
          </button>
        </div>
      )}

      {cleanMode && (
        <button
          onClick={() => setCleanMode(false)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            color: "#5B5878",
            border: "1px solid #2E3358",
            borderRadius: 999,
            padding: "8px 16px",
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <Eye size={13} />
          コントロールを表示
        </button>
      )}
    </div>
  );
}
