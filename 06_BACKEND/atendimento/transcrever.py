"""Transcreve um áudio de cliente (WhatsApp/Instagram) para texto em português.

Uso: python transcrever.py AUDIO
Saída (stdout, uma linha JSON): {"texto": "...", "duracao": 12.3}  ou  {"erro": "..."} com código 1.
Modelo: env RS_WHISPER_MODELO (padrão "small"), CPU int8, VAD ligado. Chamado pela IA do SAC (ia.mjs).
"""
import json
import os
import sys


def main():
    if len(sys.argv) < 2 or not os.path.isfile(sys.argv[1]):
        print(json.dumps({"erro": "arquivo de áudio não encontrado"}))
        return 1
    try:
        from faster_whisper import WhisperModel

        modelo = WhisperModel(os.environ.get("RS_WHISPER_MODELO") or "small", device="cpu", compute_type="int8")
        segs, info = modelo.transcribe(sys.argv[1], language="pt", vad_filter=True, beam_size=5)
        texto = " ".join(s.text.strip() for s in segs).strip()
        print(json.dumps({"texto": texto, "duracao": round(info.duration, 1)}, ensure_ascii=False))
        return 0
    except Exception as e:  # o Node cai no "[mandou um áudio]"
        print(json.dumps({"erro": f"{type(e).__name__}: {e}"[:300]}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())
