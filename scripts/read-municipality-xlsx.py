#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""総務省「都道府県コード及び市区町村コード」xlsx を安全に読み取るhelper。

依存: Python標準ライブラリのみ(zipfile / xml.etree.ElementTree / json)。
用途: scripts/update-municipalities.mjs から child_process で呼び出され、
      先頭ワークシートの全行を JSON(二次元配列・全要素文字列)で stdout に出力する。

対応: sharedStrings(書式分割<r>ラン含む) / inlineStr / 数値セル / 空セル / r属性による列位置。
先頭シートは xl/workbook.xml と xl/_rels/workbook.xml.rels から実パスを解決する
(「必ずsheet1.xml」という推測に依存しない)。

使い方: python3 scripts/read-municipality-xlsx.py path/to/code.xlsx
失敗時: exit code 1 + stderr に日本語の原因を出力(municipalities.jsonには触れない)。
"""
from __future__ import annotations
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET


def local(tag: str) -> str:
    """名前空間を除いたローカルタグ名"""
    return tag.rsplit("}", 1)[-1]


def col_index(ref: str) -> int:
    """セル参照 'AB12' → 0始まり列番号"""
    n = 0
    for ch in ref:
        if ch.isdigit():
            break
        n = n * 26 + (ord(ch.upper()) - 64)
    return n - 1


def text_of(elem: ET.Element) -> str:
    """要素配下のすべての <t> テキストを連結(書式分割ラン対応)"""
    parts = []
    for t in elem.iter():
        if local(t.tag) == "t" and t.text:
            parts.append(t.text)
    return "".join(parts)


def first_sheet_path(zf: zipfile.ZipFile) -> str:
    """workbook.xml と rels から先頭ワークシートの実パスを解決"""
    wb = ET.fromstring(zf.read("xl/workbook.xml"))
    rid = None
    for el in wb.iter():
        if local(el.tag) == "sheet":
            for k, v in el.attrib.items():
                if local(k) == "id":  # r:id
                    rid = v
            break
    targets = {}
    rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    for el in rels.iter():
        if local(el.tag) == "Relationship":
            targets[el.attrib.get("Id")] = el.attrib.get("Target", "")
    target = targets.get(rid, "") if rid else ""
    if not target:  # 保険: 最初のworksheet関係
        for v in targets.values():
            if "worksheets/" in v:
                target = v
                break
    if not target:
        raise RuntimeError("workbookから先頭ワークシートを解決できません")
    target = target.lstrip("/")
    if not target.startswith("xl/"):
        target = "xl/" + target
    return target


def load_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        data = zf.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    root = ET.fromstring(data)
    return [text_of(si) for si in root if local(si.tag) == "si"]


NUM_TRAILING_ZERO = re.compile(r"^(\d+)\.0+$")


def read_rows(path: str) -> list[list[str]]:
    with zipfile.ZipFile(path) as zf:
        shared = load_shared_strings(zf)
        sheet_path = first_sheet_path(zf)
        root = ET.fromstring(zf.read(sheet_path))
        rows: list[list[str]] = []
        for row in root.iter():
            if local(row.tag) != "row":
                continue
            cells: list[str] = []
            auto_col = 0
            for c in row:
                if local(c.tag) != "c":
                    continue
                ref = c.attrib.get("r")
                idx = col_index(ref) if ref else auto_col
                auto_col = idx + 1
                ctype = c.attrib.get("t", "")
                value = ""
                if ctype == "inlineStr":
                    value = text_of(c)
                else:
                    v = None
                    for child in c:
                        if local(child.tag) == "v":
                            v = child.text or ""
                            break
                    if v is None:
                        value = ""  # 空セル
                    elif ctype == "s":
                        try:
                            value = shared[int(v)]
                        except (ValueError, IndexError):
                            value = ""
                    else:
                        value = v
                        m = NUM_TRAILING_ZERO.match(value)
                        if m:  # 数値セルが 85464.0 のように来た場合の正規化
                            value = m.group(1)
                while len(cells) < idx:
                    cells.append("")
                if idx < len(cells):
                    cells[idx] = value
                else:
                    cells.append(value)
            rows.append(cells)
        return rows


def main() -> int:
    if len(sys.argv) != 2:
        print("使い方: python3 scripts/read-municipality-xlsx.py <xlsxファイル>", file=sys.stderr)
        return 1
    path = sys.argv[1]
    try:
        rows = read_rows(path)
    except zipfile.BadZipFile:
        print("自治体Excelの解析に失敗しました: ZIP(xlsx)として読み取れないファイルです", file=sys.stderr)
        return 1
    except KeyError as e:
        print(f"自治体Excelの解析に失敗しました: xlsx内に必要なパートがありません ({e})", file=sys.stderr)
        return 1
    except ET.ParseError as e:
        print(f"自治体Excelの解析に失敗しました: XMLの解析エラー ({e})", file=sys.stderr)
        return 1
    except Exception as e:  # 想定外も分かりやすく
        print(f"自治体Excelの解析に失敗しました: {type(e).__name__}: {e}", file=sys.stderr)
        return 1
    json.dump(rows, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
