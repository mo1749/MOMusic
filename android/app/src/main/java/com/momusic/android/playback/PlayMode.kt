package com.momusic.android.playback

enum class PlayMode(val label: String) {
    SEQUENCE("顺序播放"),
    REPEAT_ONE("单曲循环"),
    SHUFFLE("随机播放");

    fun next(): PlayMode = when (this) {
        SEQUENCE -> REPEAT_ONE
        REPEAT_ONE -> SHUFFLE
        SHUFFLE -> SEQUENCE
    }
}
