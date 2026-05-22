FROM continuumio/miniconda3:24.1.2-0

WORKDIR /app

# Criar ambiente conda (camada cacheável enquanto environment.yml não mudar)
COPY environment.yml .
RUN conda env create -f environment.yml && conda clean --all -y

# Variáveis de ambiente obrigatórias
ENV PYTHONUTF8=1
ENV GDAL_DATA=/opt/conda/envs/desmatamento/share/gdal
ENV PROJ_LIB=/opt/conda/envs/desmatamento/share/proj

# Copiar código do pipeline (pacote modular + scripts de suporte)
COPY pipeline/            ./pipeline/
COPY preprocess.py        .
COPY _gerar_documentacao.py .
COPY _baixar_prodes.py    .

# Entrypoint: preprocess.py delega para python -m pipeline
ENTRYPOINT ["conda", "run", "--no-capture-output", "-n", "desmatamento", "python", "preprocess.py"]
