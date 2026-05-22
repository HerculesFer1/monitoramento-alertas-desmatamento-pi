#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
preprocess.py — Shim de compatibilidade retroativa.

Este arquivo existe apenas para manter compatibilidade com scripts existentes
(rodar_pipeline.ps1, run_preprocess.bat) que chamam `python preprocess.py`.

A lógica do pipeline foi movida para o pacote pipeline/ (v2 modular).
Para execução direta: python -m pipeline
"""
import runpy
import sys

if __name__ == "__main__":
    runpy.run_module("pipeline", run_name="__main__", alter_sys=True)
