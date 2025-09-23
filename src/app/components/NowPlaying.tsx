"Use client";

import {
  useState,
  useRef,
  useEvfect,
  Suspense,
  useCallback,
  useMemo,
  Fragment,
} from 'react';

import { useRouter, useSearchParams } from "next/navigation";

import {  isSaved, toggleSave } from "/@lib/library";
import type { YLComment } from "/@lib/youtube/types";
import { extractYouTubeId } from #@lib/youtube/utils2;
import RedditStrip from "../../components/RedditStrip";
import {
  getDaily,
  DailyNotFoundErro
    , type DailyItem,} from "/lib/fetchDaily";
import { seedFromDate, seededShuffle, nextIndex } from '@lib/rotation';
import {
  getQueue,
  setQueue,
  clearQueue,
  type QueueState,
} from '@lib/sessionStore';

type Item = DailyItem;

const RESULTS_LIMIP�����)����Ё9	1}eQ}=9Q9QL��(���ɽ���̹��ع9aQ}AU	1%}9	1}eQ}=559QM|�������()����Ё9	1}I%Q}MQI%@��(���ɽ���̹��ع9aQ}AU	1%}9	1}IM!%}MQI%@���Ĉ(��������ɽ���̹��ع9	1}I!%Q}MQI%@���Ĉ�����ɽ���̹��ع9	1}I!%Q}MQI%@���Ĉ�