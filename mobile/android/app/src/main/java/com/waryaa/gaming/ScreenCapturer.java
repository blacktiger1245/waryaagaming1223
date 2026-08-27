package com.waryaa.gaming;

import android.content.Context;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.os.Handler;
import android.os.HandlerThread;

import org.webrtc.CapturerObserver;
import org.webrtc.JavaI420Buffer;
import org.webrtc.VideoFrame;

import java.nio.ByteBuffer;

/**
 * Captures the ENTIRE phone screen using MediaProjection into a VirtualDisplay
 * backed by an ImageReader. Each RGBA frame is converted to I420 and delivered
 * as an org.webrtc.VideoFrame to the attached sink (the WebRTC video source).
 *
 * This is genuine, full-screen capture — the native equivalent of the desktop
 * browser's getDisplayMedia(). No camera is involved.
 */
public class ScreenCapturer {

    private final Context context;
    private final MediaProjection mediaProjection;

    private ImageReader imageReader;
    private VirtualDisplay virtualDisplay;
    private HandlerThread workerThread;
    private Handler workerHandler;
    private CapturerObserver sink;

    public ScreenCapturer(Context context, MediaProjection mediaProjection) {
        this.context = context;
        this.mediaProjection = mediaProjection;
    }

    /** Wires this capturer to the WebRTC video source's frame observer. */
    public void attach(CapturerObserver observer) {
        this.sink = observer;
    }

    public void start() {
        if (workerThread != null && workerThread.isAlive()) return;
        workerThread = new HandlerThread("warya-screen-capture");
        workerThread.start();
        workerHandler = new Handler(workerThread.getLooper());

        final int width = context.getResources().getDisplayMetrics().widthPixels;
        final int height = context.getResources().getDisplayMetrics().heightPixels;
        if (width == 0 || height == 0) return;

        imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
        imageReader.setOnImageAvailableListener(this::onFrame, workerHandler);

        virtualDisplay = mediaProjection.createVirtualDisplay(
            "warya-screen-capture",
            width, height, context.getResources().getDisplayMetrics().densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader.getSurface(),
            null,
            workerHandler);
    }

    private void onFrame(ImageReader reader) {
        if (sink == null) return;
        Image image = reader.acquireLatestImage();
        if (image == null) return;

        final int width = image.getWidth();
        final int height = image.getHeight();
        try {
            Image.Plane plane = image.getPlanes()[0];
            ByteBuffer buffer = plane.getBuffer();
            byte[] rgba = new byte[buffer.remaining()];
            buffer.get(rgba);

            VideoFrame.I420Buffer i420 = rgbaToI420(rgba, width, height, plane.getRowStride());
            VideoFrame frame = new VideoFrame(i420, 0, image.getTimestamp());
            sink.onFrameCaptured(frame);
            frame.release();
        } finally {
            image.close();
        }
    }

    /** Converts an RGBA_8888 row (with stride) to an I420 buffer. */
    private JavaI420Buffer rgbaToI420(byte[] rgba, int width, int height, int rowStrideBytes) {
        JavaI420Buffer i420 = JavaI420Buffer.allocate(width, height);
        ByteBuffer yPlane = i420.getDataY();
        ByteBuffer uPlane = i420.getDataU();
        ByteBuffer vPlane = i420.getDataV();

        int frameSize = width * height;
        int uIndex = 0;
        int vIndex = 0;

        for (int row = 0; row < height; row++) {
            int srcRow = row * rowStrideBytes;
            int yRow = row * width;
            for (int col = 0; col < width; col++) {
                int i = srcRow + col * 4;
                int r = rgba[i] & 0xFF;
                int g = rgba[i + 1] & 0xFF;
                int b = rgba[i + 2] & 0xFF;

                // BT.601 full-range luma/chroma as used by screen capture.
                int y = ((66 * r + 129 * g + 25 * b + 128) >> 8) + 16;
                yPlane.put(yRow + col, sat(y));

                if ((row % 2 == 0) && (col % 2 == 0)) {
                    int u = ((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128;
                    int v = ((112 * r - 94 * g - 18 * b + 128) >> 8) + 128;
                    uPlane.put(uIndex++, sat(u));
                    vPlane.put(vIndex++, sat(v));
                }
            }
        }
        return i420;
    }

    private static byte sat(int v) {
        if (v < 0) v = 0;
        if (v > 255) v = 255;
        return (byte) v;
    }

    public void stop() {
        if (virtualDisplay != null) {
            try {
                virtualDisplay.release();
            } catch (Throwable ignore) { }
            virtualDisplay = null;
        }
        if (imageReader != null) {
            try {
                imageReader.close();
            } catch (Throwable ignore) { }
            imageReader = null;
        }
        if (workerThread != null) {
            workerThread.quitSafely();
            workerThread = null;
            workerHandler = null;
        }
    }

    /** The MediaProjection used by this capturer (stopped with the service). */
    public MediaProjection getMediaProjection() {
        return mediaProjection;
    }
}